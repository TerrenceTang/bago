var url = require('url');

exports.send404 = function(resp, message) {
  resp.status(404).end(message || "No such file");
};

exports.send400 = function(resp, message) {
  resp.status(400).end(message || "Bad request");
};

exports.send500 = function(resp, message) {
  message = message || "Server internal error";
  console.error("!!! " + message);
  resp.status(500).end(message);
};

exports.getUrl = function(req, withQuery) {
  var scheme = req.header('X-Forwarded-Protocol') || "http",
      host = req.header('host'),
      path = (withQuery ? req.url : url.parse(req.url).pathname);

  return scheme + "://" + host + path;
};

exports.toAbsoulteUrl = function(req, path) {
  var scheme = req.header('X-Forwarded-Protocol') || "http",
      host = req.header('host');

  return scheme + "://" + host + path;
};

// Try to get 'redirectTo' from req. If not available, go to root.
exports.redirectBackTo = function(req, resp) {
  var target = req.query && req.query.redirectTo;
  target = target || "/";
  resp.redirect(target);
};

exports.parseAccessToken = function(atString) {
  var parsed = atString.match(/access_token=(\w+)&expires=(\d+)/);
  return {
    accessToken: parsed[1],
    expired: Date.now() + parsed[2] * 1000 // To absolute time.
  };
}

