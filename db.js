var mongoose = require('mongoose'),
    EventEmitter = require('events').EventEmitter,
    conf = require('./config.js'),
    db;

var Schemas = {
  Link: mongoose.Schema({
    url: String,
    publisherIds: [String],
    publishers: Number
  }),
  User: mongoose.Schema({
    fbId: String,
    accessToken: String,
    accessTokenExpired: Date,
    accessor: String, // Accessor is the access token that can access
                      // this user. If this user is our member, we will
                      // use his own access token. But if he is not our
                      // member, we should put one of his friend (and this friend
                      // is our member)'s access token here.
    lastUpdate: Date // When did we update his link last time.
  })
};

var Models = {};

function buildModels() {
  Object.keys(Schemas).forEach(function(name) {
    Models[name] = mongoose.model(name, Schemas[name]);
  });
}

exports.storeUser = function(fbUser, userInfo) {
  Models.User.findOne({
    fbId: fbUser.id
  }, function(err, doc) {
    if (err) {
      console.error("Unable to store user: " + JSON.stringify(fbUser) +
                    ", error:" + err);
      return;
    }
    if (!doc) {
      if (conf.log) console.log("Unable to find existing record for: " +
                                fbUser.name + ", create one");
      doc = new Models.User({ fbId: fbUser.id });
    }
    if (userInfo.isSelf) {
      doc.accessToken = userInfo.accessToken;
      doc.accessTokenExpired = userInfo.accessTokenExpires;
    }
    doc.accessor = userInfo.accessToken;
    doc.lastUpdate = userInfo.updateDate;
    doc.save(function (err) {
      if (err) {
        console.log("Error when storing user: " + JSON.stringify(fbUser) +
                    ", error: " + err);
      }
    });
  });
};

// Remove duplicated publishers from pushlisher Id list, and update
// published count.
// TODO can we done this just inside that db?
function resolveLinkPublisherE(linkDoc) {
  var emitter = new EventEmitter();
  linkDoc.publishers = linkDoc.publisherIds.length;
  linkDoc.save(function(err, doc) {
    if (err) {
      emitter.emit('error', err);
    } else {
      emitter.emit('ok', doc);
    }
  });

  return emitter;
}

// This function doesn't return a accurate result. Instead, it returns
// the top N "unresolved" result. The result will be resolved after they are
// fetched.
exports.getLinksE = function(numOfResult) {
  var emitter = new EventEmitter();
  Models.Link.find({}).
    sort({ publishers: -1 }).
    limit(numOfResult).
    exec(function(err, docs) {
      var resolvedLinks,
          resolvingLinks;
      if (err) {
        emitter.emit('error', err);
      } else {
        // Resolve link docs.
        resolvingLinks = 0;
        resolvedLinks = [];
        docs.forEach(function(doc) {
          var resolving = resolveLinkPublisherE(doc);
          resolvingLinks++;
          function onResolvedOneLink() {
            resolvingLinks--;
            if (resolvingLinks == 0) {
              emitter.emit('ok', resolvedLinks);
            }
          }
          resolving.on('ok', function(resolvedDoc) {
            resolvedLinks.push(resolvedDoc);
            onResolvedOneLink();
          });
          resolving.on('error', function(err) {
            emitter.emit('error', err);
            onResolvedOneLink();
          });
        });
      }
    });
  return emitter;
};

exports.storeLink = function(link) {
  Models.Link.update({
    url: link.link
  }, {
    "$addToSet": {
      publisherIds: link.from.id
    },
    "$inc": {
      "publishers": 1
    }
  },{
    upsert: true
  }, function(err, doc) {
    if (err) {
      console.log("Error when storing links: " + err);
    }
    if (doc) {
      if (conf.log) console.log("Stored doc: " + JSON.stringify(doc));
    }
  });
};

exports.initDbE = function() {
  var emitter = new EventEmitter(),
      db_link = process.env.MONGOLAB_URI;

  mongoose.connect(db_link);
  db = mongoose.connection;
  db.on('error', function(err) {
    console.error('connection error: ' + err);
    emitter.emit('error', err);
  });
  db.once('open', function callback () {
    buildModels();
    emitter.emit('ok');
  });
  return emitter;
};
