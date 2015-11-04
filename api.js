var https   = require('https'),
    crypto  = require('crypto'),
    EventEmitter = require('events').EventEmitter,
    conf    = require('./config.js'),
    db      = require('./db.js'),
    util    = require('./util.js'),
    RSS     = require("./lib/rss.js"),
    fbApis  = require('./fbapis.js'),
    taskManager = require('./task-manager.js');

function getUserDataAndStoreE(fbId, accessToken, expires) {
  var emitter = new EventEmitter(),
      gettingUserInfo = fbApis.getUserInfoE(fbId, accessToken);
  gettingUserInfo.on('ok', function(fbUser) {
    db.storeUser(fbUser, { isSelf: fbId == 'me',
                           accessToken: accessToken,
                           accessTokenExpires: expires,
                           updateDate: new Date() });
    emitter.emit('ok');
  });
  gettingUserInfo.on('error', function(err) {
    console.error("Fail to get user info: " + fbId + ", error: " + err);
    emitter.emit('error', err);
  });
  return emitter;
}

function getListOfUserAndStoreE(list, accessToken, expires) {
  var emitter = new EventEmitter(),
      gettingUserInfo;

  (function onDoneOneOperation() {
    var fbId;
    if (list.length == 0) {
      emitter.emit('ok');
      return;
    }
    fbId = list.shift();
    gettingUserInfo = getUserDataAndStoreE(fbId, accessToken, expires);
    gettingUserInfo.on('ok', function() {
      onDoneOneOperation();
    });
    gettingUserInfo.on('error', function(err) {
      console.error("Fail to get user info: " + fbId + ", error: " + err);
      emitter.emit('error', err);
      onDoneOneOperation();
    });
  })();

  return emitter;
}

// ?num=N, top N published links.
exports.QueryFriendHandler = function QueryFriendHandler(req, resp) {
  var sess = req.session,
      num,
      gettingLinks;

  if (req.query.num) {
    num = parseInt(req.query.num);
  }

  if (!num || num <= 0) {
    num = 10;  // Top 10 by default.
  }

  // Only for registered user.
  if (!sess || !sess.fb_info) {
    util.send400(resp, 'please login first');
    return;
  }

  gettingLinks = db.getLinksE(num);
  gettingLinks.on('ok', function(links) {
    resp.write("<html><body>");

    links.forEach(function(link) {
      resp.write("[" + link.publishers + "] ");
      resp.write("URL: " + link.url + " ");
      resp.write(link.publisherIds.join(' '));
      resp.write("<br />");
    });

    resp.write("</body></html>");
    resp.end();
  });

  gettingLinks.on('error', function(err) {
    util.send500(resp, 'Error when getting links from db: ' + err);
  });
};

exports.FriendLinksHandler = function FriendLinksHandler (req, resp) {
  var sess = req.session,
      waitingNumber = 0,
      friends;

  function onGotLinkListOfFriends() {
    // TODO: End of querying.
  }

  function retrieveLink (friends, index) {
    var friend, gettingLinks;

    function handleError(friend, err) {
      console.error('Error when getting links for ' + friend.name + ', error: ' + err);
      retrieveLink(friends, index + 1);
    }

    if (friends.length > index && (!conf.friendLimit || index < conf.friendLimit)) {
      friend = friends[index];
      gettingLinks = fbApis.getLinksByIdE(friend.id, sess.fb_info.accessToken);
      gettingLinks.on('ok', function(list) {
        list.forEach(function(link) {
          // Got link, show how many people shared such link.
          db.storeLink(link);
        });
        retrieveLink(friends, index + 1);
      });
      gettingLinks.on('error', handleError.bind(null, friend));
      gettingLinks.on('api-error', handleError.bind(null, friend));
    } else {
      // done
      onGotLinkListOfFriends();
    }
  };


  if (!sess || !sess.fb_info || !sess.fb_info.friends) {
    util.send400(resp, 'please get friend list');
    return;
  }

  // Don't make user wait.
  util.redirectBackTo(req, resp);

  retrieveLink(sess.fb_info.friends, 0);
}

exports.FriendsHandler = function FriendsHandler (req, resp) {
  var sess = req.session,
      gettingFriends;
  if (!sess || !sess.fb_info) {
    util.send400(resp, 'please login');
    return;
  }

  gettingFriends = fbApis.getFriendsByIdE('me', sess.fb_info.accessToken);
  gettingFriends.on('ok', function(list) {
    var idList = [];
    sess.fb_info.friends = list;
    
    list.forEach(function(friend) {
      idList.push(friend.id);
    });
    taskManager.postTask(getListOfUserAndStoreE.bind(null, idList,
                                              sess.fb_info.accessToken,
                                              new Date(sess.fb_info.expired)));
    util.redirectBackTo(req, resp);
  });
};

exports.LoginHandler = function LoginHandler (req, resp) {
  if (req.query.code) {
    // For the case that receiving a login.
    var sess = req.session;
    if (!sess.fb_logging_in ||
        !sess.fb_logging_in.fb_state_token ||
        sess.fb_logging_in.fb_state_token != req.query.state) {
      util.send400(resp);
    }

    delete sess.fb_logging_in;

    https.get("https://graph.facebook.com/oauth/access_token?" +
              "client_id=" + conf.fb_app_id +
              "&redirect_uri=" + encodeURIComponent(util.getUrl(req)) +
              "&client_secret=" + conf.fb_app_secret +
              "&code=" + req.query.code,
              function(clientResp) {
                var tokenString = '';
                clientResp.on('data', function (chunk) {
                  tokenString = chunk.toString('utf8');
                });
                clientResp.on('end', function() {
                  sess.fb_info = util.parseAccessToken(tokenString);
                  console.log(sess.fb_info);
                  taskManager.postTask(
                    getUserDataAndStoreE.bind(null, 'me',
                                              sess.fb_info.accessToken,
                                              new Date(sess.fb_info.expired)));
                  util.redirectBackTo(req, resp);
                });
              }).on('error', function(e) {
                console.log("Got error: " + e.message);
              });
  } else if (req.query.error_reason) {
    // Handle auth error.

    // TODO...

  } else {
    // For the case that inital a login.
    crypto.randomBytes(32, function(ex, buf) {
      var fb_state_token;
      if (ex) throw ex;
      fb_state_token = buf.toString('hex');

      // Record login status for next step.
      req.session.fb_logging_in = {
        fb_state_token: fb_state_token
      };

      // End of out task, take user to facebook's login page.
      resp.redirect("https://www.facebook.com/dialog/oauth?" +
                    "client_id=" + conf.fb_app_id+
                    "&redirect_uri=" + encodeURIComponent(util.toAbsoulteUrl(req, "/api/fblogin")) +
                    "&state=" + fb_state_token +
                    "&scope=user_birthday,read_stream");
    });
  }
};


exports.QueryRssHandler = function(req, resp) {
  console.log("TTT");
  var rssE = RSS.getRssE();
  rssE.on("ok", function(rss){
    resp.write(rss);
    resp.end();
  });
};
