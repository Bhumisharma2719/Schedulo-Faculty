module.exports = function checkAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/login');
  }

  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map(email => email.trim().toLowerCase())
    : [];

  if (!req.user || !adminEmails.includes(req.user.email.toLowerCase())) {
    return res.status(403).send('Access Denied: Admins only');
  }

  next();
};