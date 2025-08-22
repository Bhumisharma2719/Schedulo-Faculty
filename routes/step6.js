const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teacher');
const Classroom = require('../models/classroom');
const Timetable = require('../models/Timetable');
const timetableGenerator = require('../utils/timetableGenerator');

// Generate timetable POST
router.post('/generate', async (req, res) => {
  try {
    const { university, faculty, date } = req.body;

    // Load all necessary data with proper population
    const courses = await Course.find().populate('subjects');
    const subjects = await Subject.find().populate('assignedTeacher');
    const teachers = await Teacher.find()
      .populate('assignments.course')
      .populate('assignments.subject');
    const classrooms = await Classroom.find();

    // Generate timetable object with your utility function
    const generated = timetableGenerator(courses, subjects, teachers, classrooms);

    // Render the step6 view with all data
    res.render('steps/step6', {
  timetable: {
    timetable: generated.timetable,
    days: generated.days,
    slots: generated.slots,
    subjectTeachers: generated.subjectTeachers
  },
  university,
  faculty,
  wefDate: date,
  saved: false
});

  } catch (err) {
    console.error('Error generating timetable:', err);
    res.status(500).send('Error generating timetable');
  }
});

// Save timetable POST
router.post('/save', async (req, res) => {
  const { university, faculty, date, timetableData } = req.body;

  try {
    const parsedTimetable = JSON.parse(timetableData);

    const newTimetable = new Timetable({
      university,
      faculty,
      effectiveFrom: date,
      timetable: parsedTimetable.timetable,
      days: parsedTimetable.days,
      slots: parsedTimetable.slots,
      subjectTeachers: parsedTimetable.subjectTeachers
    });

    await newTimetable.save();

    // Re-render instead of redirect, pass everything back
    res.render('steps/step6', {
      timetable: parsedTimetable,
      university,
      faculty,
      wefDate: date,
      saved: true
    });
  } catch (err) {
    console.error('Error saving timetable:', err);
    res.status(500).send('Error saving timetable.');
  }
});


// GET Step 6 main page
router.get('/', async (req, res) => {
  const saved = req.query.saved === '1';
  res.render('steps/step6', {
    timetable: null,
    subjectTeachers: null,
    days: null,
    slots: null,
    university: '',
    faculty: '',
    wefDate: '',
    saved
  });
});

router.post('/update', async (req, res) => {
  const { university, faculty, date, timetableData } = req.body;

  try {
    const parsedTimetable = JSON.parse(timetableData);

    const updated = await Timetable.findOneAndUpdate(
      { university, faculty, effectiveFrom: date },
      {
        timetable: parsedTimetable.timetable,
        days: parsedTimetable.days,
        slots: parsedTimetable.slots,
        subjectTeachers: parsedTimetable.subjectTeachers
      },
      { new: true, upsert: true }
    );

    res.render('steps/step6', {
      timetable: {
        timetable: updated.timetable,
        days: updated.days,
        slots: updated.slots,
        subjectTeachers: updated.subjectTeachers
      },
      university,
      faculty,
      wefDate: date,
      saved: false
    });
  } catch (err) {
    console.error('Error updating timetable:', err);
    res.status(500).send('Error updating timetable.');
  }
});

router.get('/timetable', (req, res) => {
  res.render('user/timetable'); // no need to add .ejs
});

module.exports = router;
