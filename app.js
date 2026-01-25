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
const facultyRoutes = require('./routes/faculty');

const step1Routes = require('./routes/step1');
const step2Routes = require('./routes/step2');
const step3Routes = require('./routes/step3');
const step4Routes = require('./routes/step4');
const step5Routes = require('./routes/step5');
const step6Routes = require('./routes/step6');

// 📅 Import TemporarySchedule for archiving
const TemporarySchedule = require('./models/TemporarySchedule');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup (only once!)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
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

// 📅 AUTO-ARCHIVE SCHEDULED CLASSES
// Archive schedules whose date has passed
async function archiveExpiredSchedules() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    // Find all 'scheduled' classes with date in the past
    const result = await TemporarySchedule.updateMany(
      {
        status: 'scheduled',
        'to.date': { $lt: today } // Date is before today
      },
      {
        $set: { status: 'archived' }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Archived ${result.modifiedCount} expired schedules`);
    }
  } catch (err) {
    console.error('❌ Error archiving schedules:', err);
  }
}

// Run archiving every hour
setInterval(archiveExpiredSchedules, 60 * 60 * 1000); // Every 60 minutes

// Also run on app startup
archiveExpiredSchedules();

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

// Faculty routes (only for logged in faculty users)
app.use('/faculty', isLoggedIn, facultyRoutes);

const scheduleRoutes = require('./routes/schedule');
app.use('/schedule', scheduleRoutes);

const adminSchedulesRoutes = require('./routes/admin-schedules');
app.use('/admin/schedules', isLoggedIn, checkAdmin, adminSchedulesRoutes);

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

  if (req.user && req.user.isFaculty) {
    return res.redirect('/faculty'); // faculty
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