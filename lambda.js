const AWS = require('aws-sdk'),
	jmespath = require('jmespath'),
	querystring = require('querystring'),
	crypto = require('crypto'),
	https = require("https"),
	url = require("url");

let pid = 'PhysicalResourceId', rp = 'ResourceProperties';
exports.handler = (ev, ctx, cb) => {
	console.log(JSON.stringify(Object.assign({}, ev, {
		ResourceProperties: null,
		OldResourceProperties: null,
	})));
	let rand = random();
	ev[rp] = fixBooleans(ev[rp], ev.RequestType !== 'Create' ? ev[pid] : fixBooleans(ev[rp][pid], null, rand), rand);
	let args = ev[rp][ev.RequestType];
	if (!args) args = ev.RequestType === 'Delete' ? {} : ev[rp]['Create'];
	['Attributes', pid, 'PhysicalResourceIdQuery', 'Parameters'].forEach(attr =>
		args[attr] = args[attr] || ev[rp][attr]
	);
	if (ev.RequestType === 'Delete') {
		request(args, ev, ctx, () => response.send(ev, ctx, 'SUCCESS', {}, ev[pid]));
	} else if (ev.RequestType === 'Create' || ev.RequestType === 'Update') {
		request(args, ev, ctx, function(data) {
			let props = ev[rp][ev.RequestType] || ev[rp]['Create'];
			if (props.PhysicalResourceIdQuery) ev[pid] = jmespath.search(data, props.PhysicalResourceIdQuery);
			if (props[pid]) ev[pid] = props[pid];
			if (props.Attributes) data = jmespath.search(data, props.Attributes);
			response.send(ev, ctx, 'SUCCESS', data, ev[pid]);
		});
	}
};

function random() {
	return crypto.randomBytes(6).toString('base64').replace(/[\+=\/]/g, '').toUpperCase();
}

function fixBooleans(obj, id, rand) {
	if (Array.isArray(obj)) return obj.map(item => fixBooleans(item, id, rand));
	else if (typeof obj === 'object') {
		for (let key in obj) obj[key] = fixBooleans(obj[key], id, rand);
		return obj;
	} else if (typeof obj === 'string') {
		obj = obj === 'true' ? true : obj === 'false' ? false : obj === 'null' ? null : obj.replace(/\${Random}/, rand);
		if (typeof obj === 'string' && id) obj = obj.replace(/\${Physical(Resource)?Id}/, id);
		return obj;
	} else return obj;
}

function b64ify(obj) {
	if (Buffer.isBuffer(obj))
		return obj.toString('base64');
	else if (Array.isArray(obj)) return obj.map(item => b64ify(item));
	else if (typeof obj === 'object') {
		for (let key in obj) obj[key] = b64ify(obj[key]);
		return obj;
	} else return obj;
}


function request(args, ev, ctx, cb) {
	if (ev.RequestType === 'Delete' && !args.Action) return cb();
	let creds = AWS.config.credentials;
	creds.getPromise().then(() => {
		if(ev[rp].RoleArn) creds = new AWS.TemporaryCredentials({
			RoleArn: ev[rp].RoleArn,
		});
		let client = new AWS[ev[rp].Service]({
			credentials: creds,
			region: ev[rp].Region || AWS.config.region,
		});
		client[args.Action](args.Parameters, (err, data) => {
			if (err && args.IgnoreErrors !== true) {
				response.send(ev, ctx, 'FAILED', err, ev[pid]);
			} else cb(data);
		});
	})
}

let response = {
	body: function(ev, ctx, responseStatus, resData, pId) {
		let body = {
			Status: responseStatus,
			Reason: resData instanceof Error ? resData.toString() : '',
			PhysicalResourceId: pId || ev.RequestId,
			StackId: ev.StackId,
			RequestId: ev.RequestId,
			LogicalResourceId: ev.LogicalResourceId,
			Data: responseStatus === 'FAILED' ? null : b64ify(resData),
		}
		if (JSON.stringify(body).length > 4096) {
			console.log('truncated responseData as it exceeded 4096 bytes');
			return Object.assign(body, {
				Data: null
			});
		} else { return body }
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
