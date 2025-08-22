const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');

const multer = require('multer');
const XLSX = require('xlsx');

// Multer config - temp storage
const upload = multer({ dest: 'uploads/' });

router.post('/import', upload.single('excelFile'), async (req, res) => {
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const department = req.session.departmentName || 'General';

    const subjectsToInsert = sheetData.map(row => ({
      fullName: row.fullName,
      shortName: row.shortName,
      count: row.count,
      hoursPerLecture: row.hoursPerLecture,
      isLab: String(row.isLab).toLowerCase() === 'yes' || String(row.isLab).toLowerCase() === 'true',
      groupSystem: String(row.isLab).toLowerCase() === 'yes' || String(row.isLab).toLowerCase() === 'true',
      labType: String(row.isLab).toLowerCase() === 'yes' || String(row.isLab).toLowerCase() === 'true' ? row.labType || '' : '',
      department
    }));

    await Subject.insertMany(subjectsToInsert);

    res.redirect('/step2');
  } catch (error) {
    console.error('Error importing Excel file:', error);
    res.status(500).send('Error importing Excel file');
  }
});


// Step 2: Get all subjects
router.get('/', async (req, res) => {
  try {
    const subjects = await Subject.find();
    const departmentName = req.session.departmentName || '';
    res.render('steps/step2', { subjects, departmentName });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving subjects");
  }
});

// Add subject
router.post('/add', async (req, res) => {
  try {
    const { fullName, shortName, count, hoursPerLecture, isLab, labType } = req.body;
    const department = req.session.departmentName || 'General';

    const newSubject = new Subject({
      fullName,
      shortName,
      count,
      hoursPerLecture,
      isLab: isLab ? true : false,
      groupSystem: isLab ? true : false,
      labType: isLab ? labType : '',
      department,
    });

    await newSubject.save();
    res.redirect('/step2');
  } catch (error) {
    console.error(error);
    res.status(500).send("Error adding subject");
  }
});

// Edit subject
router.post('/edit/:id', async (req, res) => {
  try {
    const { fullName, shortName, count, hoursPerLecture, isLab, labType } = req.body;
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).send("Subject not found");
    }

    subject.fullName = fullName;
    subject.shortName = shortName;
    subject.count = count;
    subject.hoursPerLecture = hoursPerLecture;
    subject.isLab = isLab ? true : false;
    subject.groupSystem = isLab ? true : false;
    subject.labType = isLab ? labType : '';

    await subject.save();
    res.redirect('/step2');
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating subject");
  }
});

// Delete subject
router.post('/delete/:id', async (req, res) => {
  try {
    await Subject.findByIdAndDelete(req.params.id);
    res.redirect('/step2');
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting subject");
  }
});

// Navigation
router.post('/save', (req, res) => res.redirect('/step2'));
router.post('/next', (req, res) => res.redirect('/step3'));

module.exports = router;