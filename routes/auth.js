const express = require('express');
const passport = require('passport');
const router = express.Router();

// Login Page
router.get('/login', (req, res) => {
  res.render('login'); // You should have views/auth/login.ejs
});

// Google OAuth Login
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// OAuth Callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login',
    failureMessage: true
  }),
  (req, res) => {
    if (req.user.isAdmin) {
      return res.redirect('/step1');  // Admin panel
    }
    return res.redirect('/user/timetable'); // Normal user
  }
);


// Logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;