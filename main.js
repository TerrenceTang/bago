var db = require('./db.js'),
    web = require('./web.js'),
    initQueue;

initQueue = [db.initDbE];

function run() {
  web.startWebService();
}

// Run init queue.
function initialize() {
  var emitter, task;
  if (initQueue.length == 0) {
    console.log("Initialize done.");
    run();
  } else {
    task = initQueue.shift();
    emitter = task();
    emitter.on('ok', function() {
      initialize();
    });
    emitter.on('error', function(err) {
      console.error('Fail to initialize due to ' + err);
      process.exit();
    });
  }
}

// Program entry point.
initialize();
