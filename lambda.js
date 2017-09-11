const AWS = require('aws-sdk'),
  jmespath = require('jmespath'),
  querystring = require('querystring'),
  crypto = require('crypto'),
  https = require("https"),
  url = require("url");;

exports.handler = (event, context, cb) => {
  console.log('Request', JSON.stringify(Object.assign({}, event, {
    ResourceProperties: null
  })));
  event.ResourceProperties = fixBooleans(event.ResourceProperties, event.PhysicalResourceId);
  let args = event.ResourceProperties[event.RequestType];
  if (!args) args = event.RequestType === 'Delete' ? {} : event.ResourceProperties['Create'];
  ['Attributes', 'PhysicalResourceId', 'PhysicalResourceIdQuery', 'Parameters'].forEach(attr =>
    args[attr] = args[attr] || event.ResourceProperties[attr]
  );
  if (event.RequestType === 'Delete') {
    deleteResource(args, event, context, function(data) {
      response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId);
    });
  } else if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    createOrUpdateResource(args, event, context, function(data) {
      let props = event.ResourceProperties[event.RequestType] || event.ResourceProperties['Create'];
      if (props.PhysicalResourceIdQuery) event.PhysicalResourceId = jmespath.search(data, props.PhysicalResourceIdQuery);
      if (props.PhysicalResourceId) event.PhysicalResourceId = props.PhysicalResourceId;
      if (props.Attributes) data = jmespath.search(data, props.Attributes);
      response.send(event, context, response.SUCCESS, data, event.PhysicalResourceId || event.RequestId);
    });
  }
};

function random() {
  return crypto.randomBytes(6).toString('base64').replace(/[\+=\/]/g, '').toUpperCase();
}

function fixBooleans(obj, physicalId) {
  if (Array.isArray(obj)) return obj.map(fixBooleans);
  else if (typeof obj === 'object') {
    for (key in obj) obj[key] = fixBooleans(obj[key]);
    return obj;
  } else if (typeof obj === 'string')
    return obj === 'true' ? true :
      obj === 'false' ? false :
      obj === 'null' ? null :
      obj.replace(/\${PhysicalId}/, physicalId).replace(/\${Random}/, random());
  else return obj;
}

function deleteResource(args, event, context, cb) {
  request(args, event, function(err, data) {
    if (err && args.IgnoreErrors !== true) {
      response.send(event, context, response.FAILED, err, event.PhysicalResourceId);
    } else cb(data);
  });
}

function createOrUpdateResource(args, event, context, cb) {
  request(args, event, function(err, data) {
    if (err && args.IgnoreErrors !== true) {
      response.send(event, context, response.FAILED, err, event.PhysicalResourceId);
    } else cb(data);
  });
}

function request(args, event, cb) {
  if (event.RequestType === 'Delete' && !args.Action) return cb();
  let client = new AWS[event.ResourceProperties.Service]();
  client[args.Action](args.Parameters, cb);
}

let response = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  send: (event, context, responseStatus, responseData, physicalResourceId) => {
    let responseBody = {
      Status: responseStatus,
      Reason: responseData instanceof Error ? responseData.toString() : null,
      PhysicalResourceId: physicalResourceId || context.logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: responseStatus === response.FAILED ? null : responseData,
    };

    console.log('Response', JSON.stringify(Object.assign({}, responseBody, {
      Data: null
    })));

    var parsed = url.parse(event.ResponseURL);
    https.request({
      hostname: parsed.hostname,
      path: parsed.path,
      method: 'PUT',
    }, res => () => context.done()).on("error", function(error) {
      console.log(error);
      context.done();
    }).end(JSON.stringify(responseBody));
  },
};
