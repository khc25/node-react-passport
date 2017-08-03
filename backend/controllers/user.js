const getNamespace = require('continuation-local-storage').getNamespace;
const expressNamespace = getNamespace('express');

const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const _ = require('underscore')._;

const mUser = require('../models/user');

const passportStrategy = new LocalStrategy((username, password, done) => {
  mUser.getByUsername(username, (err, user) => {
    if (err) {
      return done(err, false);
    }
    mUser.passwordHash(password, user.salt, (err, h) => {
      if (err) {
        return done(err);
      }
      if (h !== user.hash) {
        return done('Wrong password');
      }
      return done(null, user);
    });
  });
});

function init(app) {
  app.use(session({
    saveUninitialized: true,
    resave: true,
    secret: 'we_have_no_secret',
    cookie: {
      secure: false,
      maxAge: (4 * 60 * 60 * 1000),
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());
  passport.use(passportStrategy);

  passport.serializeUser((user, done) => {
    // Serialize more than just the ID so that we have more info in session to
    // work with.
    done(null, _.pick(user, ['id', 'username']));
  });

  // Be careful with CORS. Otherwise, deserialization will not happen.
  // https://stackoverflow.com/questions/26109556/req-session-passport-is-empty-deserializeuser-not-called-expressjs-passport
  // done is function(err, user).
  passport.deserializeUser((user, done) => {
    mUser.getByID(user.id, (err, user) => {
      if (err) {
        // Invalid user session. Ask passport to logout.
        expressNamespace.get('req').logout();
        // Cannot set res. Have to leave to done.
        // Sending err to done leads to weird behavior.
        // Sending both nulls will yield a nice json saying "Not authenticated".
        done(null, null);
      }
      done(err, user);
    });
  });
}

function ensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.json({
      success: false,
      err: 'Not authenticated',
    });
  }
  return next(req, res);
}

function get(req, res) {
  auth.ensureAuthenticated(req, res, (req, res) => {
    var f;
    var value;
    if (_.has(req.body, 'id')) {
      f = mUser.getByID;
      value = req.body.id;
    } else if (_.has(req.body, 'username')) {
      f = mUser.getByUsername;
      value = req.body.username;
    } else {
      return res.json({
        success: false,
        err: 'Missing id or username',
      });
    }
    f(value, (err, user) => {
      if (err) {
        return res.json({
          success: false,
          err: err,
        });
      }
      res.json({
        success: true,
        user: user,
      });
    });
  });
}

// create creates a new user.
function create(req, res) {
  if (!_.has(req.body, 'password')) {
    return res.json({
      success: false,
      err: 'Need password',
    });
  }
  const salt = mUser.passwordSalt();
  mUser.passwordHash(req.body.password, salt, (err, hash) => {
    if (err) {
      return res.json({
        success: false,
        err: err
      });
    }
    const user = _.extend(req.body,
      {
        hash: hash,
        salt: salt,
      });
    mUser.create(user, (err, user) => {
      if (err) {
        return res.json({
          success: false,
          err: err
        });
      }
      if (!user) {
        return done('Missing result', null);
      }
      res.json({
        success: true,
        user: user,
      });
    });
  });
}

function login(req, res, next) {
  passport.authenticate('local', {session: true}, (err, user) => {
    if (err) {
      return res.json({
        success: false,
        err: err,
      });
    }
    req.logIn(user, (err) => {
      if (err) {
        return res.json({
          success: false,
          err: err,
        });
      }
      user = _.pick(user, ['id', 'username']);
      res.json({
        success: true,
        user: user,
      });
    });
  })(req, res, next);
}

module.exports = {
  init,
  get,
  login,
  create,
};