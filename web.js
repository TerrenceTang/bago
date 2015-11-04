var express = require('express'),
    api     = require('./api.js'),
    conf    = require('./config.js'),
    app = express(),
    port = process.env.PORT || 5000;

app.use(express.logger()).
  use(express.cookieParser()).
  use(express.session({ secret: conf.session_secret,
                        key: conf.session_key,
                        cookie: {
                          maxAge: 60000
                        }}));

app.use(express.static(__dirname + '/assets'));

var API_HANDLER_MAP = [
  {
    path: "/api/fblogin",
    cls: api.LoginHandler
  },
  {
    path: "/api/friends",
    cls: api.FriendsHandler
  },
  {
    path: "/api/friend-links",
    cls: api.FriendLinksHandler
  },
  {
    path: "/api/query-state",
    cls: api.QueryFriendHandler
  },
  {
    path: "/api/:uid/rss",
    cls: api.QueryRssHandler
  }
];

exports.startWebService = function() {
  API_HANDLER_MAP.forEach(function(mapEntry) {
    app.get(mapEntry.path, function(req, resp) {
      mapEntry.cls(req, resp);
    });
  });
  app.listen(port);
};
