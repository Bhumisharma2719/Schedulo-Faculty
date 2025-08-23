const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const passport = require('passport');

dotenv.config();

const app = express();  // app ko sabse pehle define karna hota hai

require('./passport-setup');

const checkAdmin = require('./middleware/checkAdmin');
const userRoutes = require('./routes/user');
const authRoutes = require('./routes/auth');

const step1Routes = require('./routes/step1');
const step2Routes = require('./routes/step2');
const step3Routes = require('./routes/step3');
const step4Routes = require('./routes/step4');
const step5Routes = require('./routes/step5');
const step6Routes = require('./routes/step6');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup (only once!)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// EJS and static files setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Middleware: Check if user is logged in
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/login');
}

// MongoDB Connection
mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("DB connected"))
.catch((err) => console.error("MongoDB connection error:", err));

// Make departmentName available in all views
app.use((req, res, next) => {
  res.locals.departmentName = req.session.departmentName || '';
  next();
});

// Routes

// Auth routes (login/signup)
app.use('/auth', authRoutes);

// User routes
app.use('/user', userRoutes);
app.use('/', userRoutes); 

// Protected Step routes (only logged in & admin users)
app.use('/step1', isLoggedIn, checkAdmin, step1Routes);
app.use('/step2', isLoggedIn, checkAdmin, step2Routes);
app.use('/step3', isLoggedIn, checkAdmin, step3Routes);
app.use('/step4', isLoggedIn, checkAdmin, step4Routes);
app.use('/step5', isLoggedIn, checkAdmin, step5Routes);
app.use('/step6', isLoggedIn, checkAdmin, step6Routes);

// Redirect root to step1
app.get('/', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/login');
  }

  if (req.user && req.user.isAdmin) {
    return res.redirect('/step1'); // admin
  }

  return res.redirect('/user/timetable'); // normal user
});

// 404 fallback for unknown routes
app.use((req, res) => {
  res.status(404).send('404 - Page Not Found');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});