#!/usr/bin/env node

//sample configs, also the default configs, change it to your settings
const configsInCode = {
	// set to false to save storage and avoid problems
	logging : true,
	// run as https server, or as http server only for testing purpose (run inside stunnel will lost client IP info)
	// set to true if a https tunnel/reverse-proxy wrapped this http service
	https : false,
	// proxy domain like 'your.proxy.domain'
	domain : 'localhost',
	// proxy listening port, if Port Forwarding, it's Internal Port.
	port : 3128,
	// proxy access port, if Port Forwarding, it's External Port
	// set to 443 if https or a https tunnel/reverse-proxy wrapped this http service
	proxyport : 3128,
	// you will share your pac link as: https://your.proxy.domain/paclink , please change it to a long random '/xxxxxxxx'
	paclink : '/0000000000000000',
	// how long this IP can access proxy since last visit（relaunch browser to reauthorize access)
	iphours : 2,
	// a special paclink with username/password, format is:['paclink', 'username', 'password'], browser will prompt to input proxy username/password
	pacpass : [],  // ['/1111111111111111', 'proxyuser', 'proxypass'],
	// content of https://www.proxy.domain, style is: https://blog.ddns.com/homepage.htm. no local site for safety reason
	website :  '',
    // need to "npm install ws", it will create a inner proxy server to handle websocket traffic
	websocket : false,
	// http(s) server created outside, if empty proxy will create a http(s) server
	server : false,
	// web request handler for not proxy traffic, enable if website value is empty, by default return 403 error
	onrequest : (req, res) => {response(res,403);},
	// websocket handler for not proxy traffic, enable if websocket enabled
	onconnection : (ws, req) => { ws.close(1011, "authentication failed");},
	// ssl cert dir
	certdir : '',
	// ssl cert file, default is {certdir}/{domain}/fullchain.pem
	cert : '',
	// ssl key file, default is {certdir}/{domain}/privkey.pem
	key : '',
	// Skip register server.on("request",pacproxy.handlerequest), it can be registered outside
	skiprequest : false
};

/**
 * Dependencies
 */
const http = require('http');
const https = require('https');
const net = require('net');
const event = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Constants
 */
const iosBrowser = { 'firefox' : ' FxiOS', 'chrome' : ' CriOS', 'edge' : ' EdgiOS' } ;
const normalBrowser = { 'firefox' : ' Firefox', 'chrome' : ' Chrome', 'edge' : ' Edg', 'opera' : ' OPR' } ;
const pacDirect = 'function FindProxyForURL(url, host) { return "DIRECT";}';

/**
 * Shared Variables
 */
this.configs = false;
this.server = false;
this.httpAgents = new Map();
this.websiteAgent =  new http.Agent({ keepAlive: true});
this.websiteParsed = false;
this.proxyClients = new Map();
this.proxyUsers = new Map();
this.ipMilliSeconds = 0;
this.innerServer = false;
this.tlsServer = false;
const pacProxy = this;

/**
 * Export Module functions
 */

exports.proxy = proxy;
exports.handleRequest = handleRequest;    //use it like: httpserver.on('request', pacproxy.handlerRequest)
exports.merge = merge;

function proxy(configs) {
	if(!configs) configs = configsInCode;
	else merge(configs, configsInCode);

	pacProxy.configs = configs;
	pacProxy.ipMilliSeconds = pacProxy.configs.iphours * 3600 * 1000;
	if(pacProxy.configs.website) pacProxy.websiteParsed = new URL(pacProxy.configs.website);
	if(pacProxy.websiteParsed.host && isLocalHost(pacProxy.websiteParsed.host)) pacProxy.configs.website = false;
	if(!pacProxy.configs.paclink.startsWith('/')) pacProxy.configs.paclink = '/' + pacProxy.configs.paclink;

	event.EventEmitter.prototype._maxListeners = 500;
	event.defaultMaxListeners = 500;

	server = configs.server;
	if(!server) server = createServer();
	server.on('connect', handleConnect);
	if(!configs.skiprequest) server.on('request', handleRequest);

	if(!configs.server) server.listen(pacProxy.configs.port, () => {
		console.log(
			'\r\npac proxy server listening on port %d,\r\nshare your pac url:  \r\n%s',
			server.address().port, getShareLink('http')
		);

		if(pacProxy.configs.pacpass.length!==3) return;

		console.log(
			'\r\nshare your pac url with username/password: \r\n%s     %s / %s\r\n',
			getShareLink('http', pacProxy.configs.pacpass[0]), pacProxy.configs.pacpass[1], pacProxy.configs.pacpass[2]
		);
	});
	server.on("error", err=>console.log(err));

	pacProxy.server = server;
	if(pacProxy.configs.websocket) initInnerServer();	
	configs.server = server;
	return server;
}

function merge(vmain, vdefault){
	Object.entries(vdefault).forEach((value, key) => {
		if(!(value[0] in vmain)) vmain[value[0]] = value[1];
	} ) ;
}

function initInnerServer() {
	if(pacProxy.configs.forcert) return;
	if(pacProxy.configs.server) return;

	pacProxy.innerServer = http.createServer();
	pacProxy.innerServer.on('connect', _handleConnect);
	pacProxy.innerServer.on('request', _handleRequest);
	pacProxy.innerServer.listen(0, '127.0.0.1', () => {
		pacProxy.configs.innerport = pacProxy.innerServer.address().port; 
		console.log('\r\npac proxy server listening on port %d,\r\nshare your wss url:  \r\n%s\r\n',
		pacProxy.configs.innerport, getShareLink('ws'));
		var WebSocket = require("ws");
		var ws = new WebSocket.Server({ server: pacProxy.server });
		ws.on("connection", handleWebsocket);
	});

	if(!pacProxy.configs.https) return;
	
	pacProxy.tlsServer = createServer();
	pacProxy.tlsServer.on('connect', _handleConnect);
	pacProxy.tlsServer.on('request', _handleRequest);
	pacProxy.tlsServer.listen(0, '127.0.01', ()=>{
		pacProxy.configs.tlsport = pacProxy.tlsServer.address().port;
		console.log('\r\npac proxy server listening on port %d,\r\nshare your wss+tls url:  \r\n%s\r\n',
		pacProxy.configs.tlsport, getShareLink('ws')+'/tls');
	});
}

function gErrorHandler(e) {
	log('General Error %s ',  e.message);
}
/**
 * Start Server if configured
 */

// uncomment to run
run();

function run() {
	if(!process.argv[1].includes(__filename)) return;  //used as a module
    var configs = getConfigs();
	proxy(configs);
}

function getConfigs(){
	if(!process.argv[2]) return configsInCode;
	if(!isNaN(process.argv[2])){
		configsInCode.port = process.argv[2];
		return configsInCode;
	}

	let configPath = path.resolve(process.cwd(), process.argv[2]);
	let configs = require(configPath);

	if(!process.argv[3]) return configs;

	configs.port = process.argv[3]; 
	return configs;
}

function createServer() {
	if(!pacProxy.configs.https) return http.createServer();

	if(pacProxy.configs.cert && pacProxy.configs.key){
		let cert1 = fs.readFileSync(pacProxy.configs.cert);
		let key1 = fs.readFileSync(pacProxy.configs.key);
		return https.createServer({key: key1, cert: cert1});
	}

	var certDir = pacProxy.configs.certdir || process.env.CERTDIR || process.cwd()

	let domain = pacProxy.configs.domain;
	var options = {
	  key: fs.readFileSync(`${certDir}/${domain}/privkey.pem`),
	  cert: fs.readFileSync(`${certDir}/${domain}/fullchain.pem`)
	};
	
	return https.createServer(options);
}

function getShareLink(protocal, vlink) {
	let linkDomain = protocal + (pacProxy.configs.https? 's://' : '://') + pacProxy.configs.domain;
	let linkHost = ':' + pacProxy.configs.proxyport;
	if(pacProxy.configs.https && (pacProxy.configs.proxyport == 443)) linkHost = ''; 
	if(!pacProxy.configs.https && (pacProxy.configs.proxyport == 80)) linkHost = '';
	if(!vlink) vlink = pacProxy.configs.paclink;
	return linkDomain + linkHost + vlink;
}

/**
 * Shared Functions
 */
function filterHeader(reqHeaders){
	let resHeaders = reqHeaders;
	if(!reqHeaders) return resHeaders;
	if ('connection' in resHeaders) delete resHeaders['connection'];
	if ('keep-alive' in resHeaders) delete resHeaders['keep-alive'];
	if ('upgrade' in resHeaders) delete resHeaders['upgrade'];
	return resHeaders;
}

function log(...args) {
	if (pacProxy.configs && pacProxy.configs.logging) console.log(...args);
}

function pacContent(userAgent, vbrowser) {
	log('%s PAC %s ', vbrowser, userAgent);
	if(vbrowser){
		let mbrowser = vbrowser.trim().toLowerCase();
		if(mbrowser in normalBrowser){
			if(!userAgent) return pacDirect;
			else if(!userAgent.includes(normalBrowser[mbrowser])) return pacDirect;
			else if(mbrowser=='chrome'){
				if(userAgent.includes(normalBrowser['edge'])) return pacDirect;
				if(userAgent.includes(normalBrowser['opera'])) return pacDirect;
			}
		} else {
			return pacDirect;
		}
	}

	let proxyType = pacProxy.configs.https ? 'HTTPS' : 'PROXY' 
	let pacjs = `function FindProxyForURL(url, host) { return "${proxyType} ${pacProxy.configs.domain}:${pacProxy.configs.proxyport}";}`;
	return pacjs;
}

function isLocalHost(host) {
	if(!host) return true;
	let domain = (host.split(':')[0]).trim();
	if(domain.includes('localhost') || domain.includes('.local')) return true;
	return isLocalIP(domain);
}

function isLocalIP(address) {
	if(!address) return true;
	if(address.includes('::')) return true;  //ipv6 native ip
	if(address.startsWith('192.168') || address.startsWith('10.') || address.startsWith('127.') || address.startsWith('169.254')) return true;
	return false;
}

function authenticate(req, res) {
	if(basicAuthentication(req)) return true;
	var checkIP = req.socket.remoteAddress;
	if(pacProxy.proxyUsers.has(checkIP)){
		let [pacPassTime, userAgent] = pacProxy.proxyUsers.get(checkIP);
		if(Date.now()>pacPassTime) pacProxy.proxyUsers.delete(checkIP);
		else if(req.headers['user-agent']==userAgent) return 407
	}

	if(!pacProxy.proxyClients.has(checkIP)) return false;
	if (pacProxy.proxyClients.get(checkIP) >= Date.now()){	
		pacProxy.proxyClients.set(checkIP,Date.now());
		return true;
	} else {
		pacProxy.proxyClients.delete(checkIP);
		return false;
	}
}

function basicAuthentication(request) {
	if(pacProxy.configs.pacpass.length!==3) return false;
	let Authorization = request.headers['proxy-authorization'];
	if(!Authorization) return false;
	const [scheme, encoded] = Authorization.split(' ');
	if (!encoded || scheme !== 'Basic') return false;

	const buffer = Uint8Array.from(Buffer.from(encoded, 'base64').toString('binary'), (character) =>
	  character.charCodeAt(0)
	);
	const decoded = new TextDecoder().decode(buffer).normalize();
	const index = decoded.indexOf(':');
	if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) return false;
	let vuser = decoded.substring(0, index).trim();
	let vpass = decoded.substring(index + 1);
	if((vuser==pacProxy.configs.pacpass[1]) && (vpass==pacProxy.configs.pacpass[2])) return true;
	return false;
}

function response(res, httpCode, headers, content) {
	if(headers) res.writeHead(httpCode, headers);
	else res.writeHead(httpCode);

	if(content) res.write(content);
	res.end();
}

function socketResponse(socket, content, cb) {
	if(socket.destroyed) return;
	if(!cb) cb = () => socket.end();
    try {
        socket.write(content+ '\r\n', 'UTF-8', cb);
    } catch (error) {
        cb(error);
    }
}

function requestRemote(parsed, req, res) {
	var gotResponse = false;

	log('%s Fetch %s ', visitorIP, parsed);
	var agent = http;
	if(parsed.protocol == 'https:') agent = https;

	var proxyReq = agent.request(parsed, function(proxyRes) {
		if(isLocalIP(proxyRes.socket.remoteAddress)) return endRequest();

		var headers = filterHeader(proxyRes.headers);

		gotResponse = true;

		res.writeHead(proxyRes.statusCode, headers);
		proxyRes.pipe(res);
		res.on('finish', endRequest);

	});
	
	proxyReq.on('error',  (err) => {
		if (gotResponse) {}
		else if ('ENOTFOUND' == err.code) response(res,400);
		else response(res,500);
		endRequest();
	});

	res.on('close', endRequest);
	req.socket.on('close', endRequest);
	req.socket.on('error', endRequest);

	function endRequest() {
		try{
			req.socket.end()			
			req.socket.removeListener('close', endRequest);
			proxyReq.end();
			res.removeListener('finish', endRequest);
			res.removeListener('error', endRequest);
		} catch (e) {
			log('%s Error %s ', visitorIP, e.message);
		}		
	}

	req.pipe(proxyReq);
}


/**
 * handle website requests
 */
function handleWebsite(req, res, parsed) {
    try {
		visitorIP = req.socket.remoteAddress;
		log('%s %s %s ', visitorIP, req.headers.host, req.url);

		if (pacProxy.configs.paclink && req.url.startsWith(pacProxy.configs.paclink)) {
			pacProxy.proxyClients.set(visitorIP,Date.now()+pacProxy.ipMilliSeconds)
			let vpac = pacContent(req.headers['user-agent'], req.url.slice(pacProxy.configs.paclink.length+1));
			return response(res,200,{'Content-Type': 'text/plain'},vpac);
		}

		if ((pacProxy.configs.pacpass.length==3) && req.url.startsWith(pacProxy.configs.pacpass[0])) {
			let vpac = pacContent(req.headers['user-agent'], req.url.slice(pacProxy.configs.pacpass[0].length+1));
			if(vpac==pacDirect) return response(res,200,{'Content-Type': 'text/plain'},vpac);
			if(!basicAuthentication(req)) pacProxy.proxyUsers.set(visitorIP,[Date.now()+120000, req.headers['user-agent']]);
			return response(res,200,{'Content-Type': 'text/plain'},vpac);
		}

		if(!pacProxy.configs.website) return pacProxy.configs.onrequest(req, res);

		try{
			if(! parsed) parsed = new URL('http://'+pacProxy.configs.domain + req.url);
		} catch (e) {
			return  response(res, 403);
		}

		var headers = filterHeader(req.headers);
 	    if ((! 'host' in headers) || (headers.host.split(':')[0] != pacProxy.configs.domain))  return response(res, 403);

		if (parsed.pathname == '/') parsed.pathname = pacProxy.websiteParsed.pathname;
		parsed.protocol = pacProxy.websiteParsed.protocol;
		parsed.host = pacProxy.websiteParsed.host;
		parsed.port = pacProxy.websiteParsed.port;
		parsed.method = req.method;
		parsed.headers = headers;
		parsed.agent = pacProxy.websiteAgent;

		requestRemote(parsed, req, res);

	} catch (e) {
		log('%s Error %s ', visitorIP, e.message);
	}
}

/**
 * handle proxy http requests
 */

function handleRequest(req, res) {
	if(req.url.startsWith('/')) return handleWebsite(req, res);
	let auth = authenticate(req, res);
	if(!auth) return  response(res, 403);
	if(auth==407) return response(res,407,{'Proxy-Authenticate': 'Basic realm="proxy"'});
	_handleRequest(req, res);
}

function _handleRequest(req, res) {
	visitorIP = req.socket.remoteAddress;	
	log('%s %s %s ', visitorIP, req.method, req.url);
	if((visitorIP=='127.0.0.1') && req.headers.host.startsWith('localhost') && req.url.startsWith('/pac')) {
		let vpac = pacContent(req.headers['user-agent'], req.url.slice(5));
		if(vpac==pacDirect) return response(res,200,{'Content-Type': 'text/plain'},vpac);
		let pacjs = `function FindProxyForURL(url, host) { return "PROXY ${req.headers.host}";}`;
		return response(res,200,{'Content-Type': 'text/plain'}, pacjs);
	}

	try {
		var parsed = new URL(req.url);
	} catch (e) {
		return  response(res, 403);
	}

	if(parsed.host && (parsed.host.split(':')[0] == pacProxy.configs.domain)) return handleWebsite(req, res, parsed);
	if(isLocalHost(parsed.host)) return response(res, 403);
	req.socket.setTimeout(60*1000+100);

	var headers = filterHeader(req.headers);

	parsed.method = req.method;
	parsed.headers = headers;

	// use keep-alive http agents
	var host = parsed.host;
	var agent = pacProxy.httpAgents.get(host);
	if (!agent) {
		agent =  new http.Agent({ keepAlive: true});
		pacProxy.httpAgents.set(host,agent);
	}
	parsed.agent = agent;

	if (! parsed.port) {
		parsed.port = 80;
	}

	try{	
		requestRemote(parsed, req, res);
	} catch (e) {
		log('%s Error %s ', visitorIP, e.message);
	}
};

/**
 * handle CONNECT proxy requests.
 */

function handleConnect(req, socket) {
	socket.on('error', gErrorHandler);
	socket.pause();
	let auth = authenticate(req, socket);
	socket.resume();
	if(!auth)  return socketResponse(socket,  'HTTP/1.1 403 Forbidden\r\n');
	if(auth == 407 ) return socketResponse(socket, 'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="proxy"\r\n');
	_handleConnect(req, socket);
}

function _handleConnect(req, socket) {
	if(isLocalHost(req.url)) return socketResponse(socket, 'HTTP/1.1 403 Forbidden\r\n');
	socket.setTimeout(60*1000+100);
    try {
		visitorIP = req.socket.remoteAddress;
		log('%s %s %s ', visitorIP, req.method, req.url);

		var gotResponse = false;

		ontunnelerror = (err) => {
			if (gotResponse) return socket.end();
			if ('ENOTFOUND' == err.code) return socketResponse(socket, 'HTTP/1.1 404 Not Found\r\n');
			else  return socketResponse(socket, 'HTTP/1.1 500 Internal Server Error\r\n');
		}

        var ropts = {
            host: req.url.split(':')[0],
            port: req.url.split(':')[1] || 443
        };

		transfer = (error) =>  {
			try{
				gotResponse = true;
				if (error) {
					tunnel.end();
					socket.end();
					return;
				}
				tunnel.pipe(socket);
				socket.pipe(tunnel);
			} catch (e) {
				log('%s Error %s ', visitorIP, e.message);
			}
		};

		var tunnel = net.createConnection(ropts, 
			socketResponse(socket,  'HTTP/1.1 200 Connection established\r\n', transfer)
		);

		tunnel.on('lookup',(err, addresss) => {
			if(isLocalIP(addresss)){
				log('%s Error %s ', visitorIP, 'visit localIP');
				tunnel.end();
				socket.end();
			}
		});

		tunnel.on('error', ontunnelerror);
		tunnel.on('close', () => socket.end());
		tunnel.setNoDelay(true);
    } catch (e) {
		log('%s Error %s ', visitorIP, e.message);
    }
}

function handleWebsocket(ws, req) {
	if(!req.url.startsWith( pacProxy.configs.paclink)) return pacProxy.configs.onconnection(ws,req);
	let visitorIP = req.socket.remoteAddress;
	let suburl = req.url.slice(pacProxy.configs.paclink.length);
	log('%s %s %s ', visitorIP, 'WSS', suburl);

	if(!suburl) var tolocal = { host: '127.0.0.1', port: pacProxy.configs.innerport};
	else if(suburl.toLowerCase() == '/tls')  var tolocal = { host: '127.0.0.1', port: pacProxy.configs.tlsport};
	else return ws.close(1011, "authentication failed");

	try{
		var tunnel = net.createConnection(tolocal)
		ws.on('close', () => tunnel.end());
		ws.on('error', () => tunnel.end());
		tunnel.on('end', () => ws.close(1000));
		tunnel.on('error', () => ws.close(1000));  
		tunnel.on('data', data => ws.send(data));	
		ws.on('message', data => tunnel.write(data));
	} catch (e) {
		log('%s Error %s ', visitorIP, e.message);
	}
}
