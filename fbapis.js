var EventEmitter = require('events').EventEmitter,
    https        = require('https'),
    conf         = require('./config.js');

// General api.
exports.getGraphApiE = function getGraphApiE(url) {
  var emitter = new EventEmitter();
  https.get(url,
            function (clientResp) {
              var json = '';
              clientResp.on('data', function(data) {
                json += data.toString('utf8');
              });
              clientResp.on('end', function() {
                var dataObj = JSON.parse(json);
                if (dataObj.error) {
                  emitter.emit('api-error', dataObj);
                } else {
                  // Data is retrieved correctly.
                  emitter.emit('ok', dataObj);
                }
              });
            }).on('error', function(e) {
              emitter.emit('error', e);
            });
  return emitter;
};

exports.getFriends = function getFriends(url, existedFriendList, emitter) {
  if (conf.log) console.log('getting friend for url: ' + url);
  var req = this.getGraphApiE(url),
      self = this;
  existedFriendList = existedFriendList || []; // If we are already have part of list.
  req.on('ok', function(data) {
    if (!data.data) {
      emitter.emit('api-error', data, 'unable to read friend list');
      return;
    }

    existedFriendList = existedFriendList.concat(data.data);

    if (data.data.length > 0 && data.paging && data.paging.next) {
      self.getFriends(data.paging.next, existedFriendList, emitter);
    } else {
      // No paging anymore, return.
      emitter.emit('ok', existedFriendList);
    }
  });
  req.on('api-error', function(obj, msg) {
    emitter.emit('api-error', obj, msg);
  });
  req.on('error', function(err) {
    emitter.emit('error', err);
  });
};

exports.getFriendsByIdE = function getFriendsByIdE(id, accessToken) {
  var emitter = new EventEmitter();

  this.getFriends("https://graph.facebook.com/" + id + "/friends" +
                  "?access_token=" + accessToken, [], emitter);
  return emitter;
};

exports.getLinks = function getLinks (url, existedLinkList, emitter) {
  if (conf.log) console.log('getting link for url: ' + url);
  var req = this.getGraphApiE(url),
      self = this;
  existedLinkList = existedLinkList || []; // If we are already have part of list.
  req.on('ok', function(data) {
    if (!data.data) {
      emitter.emit('api-error', data, 'unable to read link list');
      return;
    }

    existedLinkList = existedLinkList.concat(data.data);

    if ((!conf.linkLimit || existedLinkList.length < conf.linkLimit) &&
        data.data.length > 0 &&
        data.paging &&
        data.paging.next) {
      self.getLinks(data.paging.next, existedLinkList, emitter);
    } else {
      // No paging anymore, return.
      if (conf.linkLimit && existedLinkList.length < conf.linkLimit) {
        existedLinkList.length = conf.linkLimit;
      }
      emitter.emit('ok', existedLinkList);
    }
  });
  req.on('api-error', function(obj, msg) {
    emitter.emit('api-error', obj, msg);
  });
  req.on('error', function(err) {
    emitter.emit('error', err);
  });
};

exports.getLinksByIdE = function getLinksByIdE(id, accessToken) {
  var emitter = new EventEmitter();
  this.getLinks("https://graph.facebook.com/" + id + "/links" +
                "?access_token=" + accessToken, [], emitter);
  return emitter;
};

exports.getUserInfoE = function getUserInfoE(id, accessToken) {
  var emitter = new EventEmitter(),
      json = "";
  https.get("https://graph.facebook.com/" + id + "?access_token=" + accessToken,
            function(resp) {
              resp.on('data', function(d) {
                json += d.toString('utf8');
              });
              resp.on('end', function(err) {
                emitter.emit('ok', JSON.parse(json));
              });
            });
  return emitter;
};
