const AWS = require('aws-sdk'),
  jmespath = require('jmespath'),
  response = require('cfn-response'),
  querystring = require('querystring'),
  crypto = require('crypto');

exports.handler = (event, context, cb) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  event.ResourceProperties = fixBooleans(event.ResourceProperties, event.PhysicalResourceId);
  let args = event.ResourceProperties[event.RequestType];
  if(!args) args = event.RequestType === 'Delete' ? {} : event.ResourceProperties['Create'];
  ['Attributes', 'PhysicalId', 'Parameters'].forEach(attr =>
    args[attr] = args[attr] || event.ResourceProperties[attr]
  );
  if (event.RequestType === 'Delete') {
    deleteResource(args, event, context, function(data) {
      response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId);
    });
  } else if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    createOrUpdateResource(args, event, context, function(data) {
      let props = event.ResourceProperties[event.RequestType] || event.ResourceProperties['Create'];
      if(props.PhysicalId) event.PhysicalResourceId = jmespath.search(data, props.PhysicalId);
      if(props.Attributes) data = jmespath.search(data, props.Attributes);
      response.send(event, context, response.SUCCESS, data, props.PhysicalId ? event.PhysicalResourceId : event.RequestId);
    });
  }
};

function random() {
  return crypto.randomBytes(6).toString('base64').replace(/[\+=\/]/g, '').toUpperCase();
}

function fixBooleans(obj, physicalId) {
  if(Array.isArray(obj)) return obj.map(fixBooleans);
  else if(typeof obj === 'object') {
    for(key in obj) obj[key] = fixBooleans(obj[key]);
    return obj;
  }
  else if(typeof obj === 'string')
    return obj === 'true' ? true :
      obj === 'false' ? false :
      obj.replace(/\${PhysicalId}/, physicalId).replace(/\${Random}/, random());
  else return obj;
}

function deleteResource(args, event, context, cb) {
  request(args, event, function(err, data) {
    if (err && args.IgnoreErrors !== 'true') {
      console.error(err);
      response.send(event, context, response.FAILED, null, event.PhysicalResourceId);
    } else cb(data);
  });
}

function createOrUpdateResource(args, event, context, cb) {
  request(args, event, function(err, data) {
    if (err && args.IgnoreErrors !== 'true') {
      console.error(err);
      response.send(event, context, response.FAILED, null, event.PhysicalResourceId);
    } else cb(data);
  });
}

function request(args, event, cb) {
  if(event.RequestType === 'Delete' && !args.Action) return cb();
  let client = new AWS[event.ResourceProperties.Service]();
  client[args.Action](args.Parameters, cb);
}
