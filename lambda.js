const AWS = require('aws-sdk'),
  jmespath = require('jmespath'),
  querystring = require('querystring'),
  crypto = require('crypto'),
  https = require("https"),
  url = require("url");

exports.handler = (ev, ctx, cb) => {
  console.log(JSON.stringify(Object.assign({}, ev, {
    ResourceProperties: null,
    OldResourceProperties: null,
  })));
  let rand = random(), pid = 'PhysicalResourceId';
  ev.ResourceProperties = fixBooleans(ev.ResourceProperties, ev[pid] || fixBooleans(ev.ResourceProperties[pid], null, rand), rand);
  let args = ev.ResourceProperties[ev.RequestType];
  if (!args) args = ev.RequestType === 'Delete' ? {} : ev.ResourceProperties['Create'];
  ['Attributes', pid, 'PhysicalResourceIdQuery', 'Parameters'].forEach(attr =>
    args[attr] = args[attr] || ev.ResourceProperties[attr]
  );
  if (ev.RequestType === 'Delete') {
    updateResource(args, ev, ctx, function(data) {
      response.send(ev, ctx, response.SUCCESS, {}, ev[pid]);
    });
  } else if (ev.RequestType === 'Create' || ev.RequestType === 'Update') {
    updateResource(args, ev, ctx, function(data) {
      let props = ev.ResourceProperties[ev.RequestType] || ev.ResourceProperties['Create'];
      if (props.PhysicalResourceIdQuery) ev[pid] = jmespath.search(data, props.PhysicalResourceIdQuery);
      if (props[pid]) ev[pid] = props[pid];
      if (props.Attributes) data = jmespath.search(data, props.Attributes);
      response.send(ev, ctx, response.SUCCESS, data, ev[pid]);
    });
  }
};

function random() {
  return crypto.randomBytes(6).toString('base64').replace(/[\+=\/]/g, '').toUpperCase();
}

function fixBooleans(obj, id, rand) {
  if (Array.isArray(obj)) return obj.map(item => fixBooleans(item, id, rand));
  else if (typeof obj === 'object') {
    for (key in obj) obj[key] = fixBooleans(obj[key], id, rand);
    return obj;
  } else if (typeof obj === 'string') {
    obj = obj === 'true' ? true : obj === 'false' ? false : obj === 'null' ? null : obj.replace(/\${Random}/, rand);
    if (typeof obj === 'string' && id) obj = obj.replace(/\${PhysicalId}/, id).replace(/\${PhysicalResourceId}/, id);
    return obj;
  } else return obj;
}

function b64ify(obj) {
  if (Buffer.isBuffer(obj))
    return obj.toString('base64');
  else if (Array.isArray(obj)) return obj.map(item => b64ify(item));
  else if (typeof obj === 'object') {
    for (key in obj) obj[key] = b64ify(obj[key]);
    return obj;
  } else return obj;
}

function updateResource(args, ev, ctx, cb) {
  request(args, ev, function(err, data) {
    if (err && args.IgnoreErrors !== true) {
      response.send(ev, ctx, response.FAILED, err, ev.PhysicalResourceId);
    } else cb(data);
  });
}

function request(args, ev, cb) {
  if (ev.RequestType === 'Delete' && !args.Action) return cb();
  let client = new AWS[ev.ResourceProperties.Service]();
  client[args.Action](args.Parameters, cb);
}

let response = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  body: function(ev, ctx, responseStatus, responseData, pId) {
    let body = {
      Status: responseStatus,
      Reason: responseData instanceof Error ? responseData.toString() : '',
      PhysicalResourceId: pId || ev.RequestId,
      StackId: ev.StackId,
      RequestId: ev.RequestId,
      LogicalResourceId: ev.LogicalResourceId,
      Data: responseStatus === response.FAILED ? null : b64ify(responseData),
    }
    if (JSON.stringify(body).length > 4096) {
      console.log('truncated responseData as it exceeded 4096 bytes');
      return Object.assign(body, {
        Data: null
      });
    } else {
      return body;
    }
  },
  send: function(ev, ctx) {
    let responseBody = response.body.apply(this, arguments);
    console.log('Response', JSON.stringify(Object.assign({}, responseBody, {
      Data: null
    })));

    var parsed = url.parse(ev.ResponseURL);
    https.request({
      hostname: parsed.hostname,
      path: parsed.path,
      method: 'PUT',
    }, res => () => ctx.done()).on("error", function(error) {
      console.log(error);
      ctx.done();
    }).end(JSON.stringify(responseBody));
  },
};
