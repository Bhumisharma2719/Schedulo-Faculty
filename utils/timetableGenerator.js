function normalizeTime(str) {
  const [h, m] = str.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}
function timeToMinutes(time) {
  const [h, m] = normalizeTime(time).split(':').map(Number);
  return h * 60 + m;
}
function isTeacherAvailable(teacher, day, slotTime) {
  if (!teacher || !Array.isArray(teacher.timeOff) || teacher.timeOff.length === 0) return true;
  const [slotStart, slotEnd] = slotTime.split('-').map(timeToMinutes);
  return !teacher.timeOff.some(off => {
    if (!off || !off.day || !off.start || !off.end) return false;
    if (off.day !== day) return false;
    const offStart = timeToMinutes(off.start);
    const offEnd = timeToMinutes(off.end);
    return (slotStart < offEnd && slotEnd > offStart);
  });
}

// Helper: Get eligible rooms for a course based on strength
function getEligibleRoomsForCourse(classrooms, courseStrength) {
  return classrooms.filter(r => {
    if (r.classOrLab !== 'class') return false;
    if (!r.capacityRange) return false;
    const [min, max] = r.capacityRange.split('-').map(Number);
    return courseStrength >= min && courseStrength <= max;
  });
}

// Helper: For labs, try to assign different labs for G1 and G2
function getLabForGroup(labs, usedLabs, labType, group) {
  let availableLabs = labs.filter(l =>
    (!labType || l.labType === labType) &&
    !usedLabs.includes(l.roomNumber)
  );
  availableLabs = availableLabs.sort(() => Math.random() - 0.5);
  if (availableLabs.length > 0) return availableLabs[0];
  // As last resort, allow any lab
  return labs.find(l => !labType || l.labType === labType) || labs[0];
}

function timetableGenerator(courses, subjects, teachers, classrooms) {
  const timetable = {};    
  const subjectTeachers = {};
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const slots = [
    '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
    '13:00-13:30',
    '13:30-14:30', '14:30-15:30', '15:30-16:30', '16:30-17:30'
  ];

  const totalSlots = slots.length;

  const roomSchedule = {};
  const teacherSchedule = {};

  days.forEach(day => {
    roomSchedule[day] = Array(totalSlots).fill().map(() => []);
    teacherSchedule[day] = Array(totalSlots).fill().map(() => []);
  });

  const firstHalfSlots = [0, 1, 2, 3];
  const secondHalfSlots = [5, 6, 7, 8]; // skip index 4 (lunch)

  for (const course of courses) {
    const courseName = course.courseShortName;
    timetable[courseName] = {};
    subjectTeachers[courseName] = [];

    const courseStrength = course.strength || course.studentStrength || 0;
    let eligibleRooms = getEligibleRoomsForCourse(classrooms, courseStrength);

    // Fallback: If no eligible room found, use all class rooms with max capacity >= strength
    if (eligibleRooms.length === 0) {
      eligibleRooms = classrooms.filter(r =>
        r.classOrLab === 'class' &&
        r.capacityRange &&
        parseInt(r.capacityRange.split('-')[1]) >= courseStrength
      );
    }

    days.forEach(day => {
      timetable[courseName][day] = Array(totalSlots).fill(null);
      timetable[courseName][day][4] = {
        room: '',
        subject: 'Break',
        teacher: ''
      }; // fixed lunch break
    });

    const courseSubjects = course.subjects;
    const shuffledSubjects = [...courseSubjects].sort(() => Math.random() - 0.5);

    let assignedRoomForCourse = null;
    let assignedLabsForGroups = {}; // { 'Lab-1': roomNumber, 'Lab-2': roomNumber }

    for (const subject of shuffledSubjects) {
      const teacher = teachers.find(t =>
        t.assignments.some(a =>
          String(a.course?._id) === String(course._id) &&
          String(a.subject?._id) === String(subject._id)
        )
      ) || null;
      
      subjectTeachers[courseName].push({
        subjectShort: subject.shortName,
        subjectLong: subject.fullName,
        teacherShort: teacher?.shortName || 'TBA',
        teacherLong: teacher?.name || 'To Be Assigned'
      });

      const isLab = subject.isLab;
      const requiredSessions = subject.count;
      let scheduled = 0;
      const perDayPlacement = {};

      while (scheduled < requiredSessions) {
        const availableDays = days.filter(day => (perDayPlacement[day] || 0) < 2);
        if (availableDays.length === 0) break;

        const shuffledDays = [...availableDays].sort(() => Math.random() - 0.5);

        let placed = false;

        for (const day of shuffledDays) {
          if (isLab) {
            const labSlotPairs = [
              [0, 1],
              [2, 3],
              [5, 6],
              [7, 8]
            ];

            let labPlaced = false;

            for (const [slot1, slot2] of labSlotPairs) {
  if (
    timetable[courseName][day][slot1] === null &&
    timetable[courseName][day][slot2] === null
  ) {
    // Try to assign different labs for G1 and G2
    const labGroup = scheduled < 2 ? 'Lab-1' : 'Lab-2';
    let room = null;
    const labs = classrooms.filter(r => r.classOrLab === 'lab');
    const usedLabs = [
      ...roomSchedule[day][slot1],
      ...roomSchedule[day][slot2]
    ];
    // Try to keep same lab for group if already assigned
    if (assignedLabsForGroups[labGroup]) {
      room = labs.find(l =>
        l.roomNumber === assignedLabsForGroups[labGroup] &&
        (!subject.labType || l.labType === subject.labType) &&
        !usedLabs.includes(l.roomNumber)
      );
    }
    if (!room) {
      room = getLabForGroup(labs, usedLabs, subject.labType, labGroup);
    }
    if (room) assignedLabsForGroups[labGroup] = room.roomNumber;

    // --- CLASH CHECKS for LABS ---
    const roomFree =
      room &&
      !roomSchedule[day][slot1].includes(room.roomNumber) &&
      !roomSchedule[day][slot2].includes(room.roomNumber);
    const teacherFree = !teacher || (
      !teacherSchedule[day][slot1].includes(teacher.shortName) &&
      !teacherSchedule[day][slot2].includes(teacher.shortName) &&
      isTeacherAvailable(teacher, day, slots[slot1]) &&
      isTeacherAvailable(teacher, day, slots[slot2])
    );

    if (roomFree && teacherFree) {
      const label = `${subject.shortName} (${labGroup} (G${scheduled < 2 ? 1 : 2}))`;

      const cell = {
        room: `${room.roomNumber}, ${room.building}`,
        subject: label,
        teacher: teacher?.shortName || 'TBA'
      };

      timetable[courseName][day][slot1] = cell;
      timetable[courseName][day][slot2] = cell;

      roomSchedule[day][slot1].push(room.roomNumber);
      roomSchedule[day][slot2].push(room.roomNumber);

      if (teacher) {
        teacherSchedule[day][slot1].push(teacher.shortName);
        teacherSchedule[day][slot2].push(teacher.shortName);
      }

      perDayPlacement[day] = (perDayPlacement[day] || 0) + 2;
      scheduled += 2;
      labPlaced = true;
      break;
    }
  }
}

            if (labPlaced) {
              placed = true;
              break;
            }
          } else {
            // --- LECTURE ROOM ALLOCATION LOGIC ---
const trySlots = [...firstHalfSlots, ...secondHalfSlots];
for (let i = 0; i < trySlots.length; i++) {
  const slot = trySlots[i];

  if (timetable[courseName][day][slot] === null) {
    // Assign a room for this course for the first time
    if (!assignedRoomForCourse) {
      assignedRoomForCourse = eligibleRooms[0]?.roomNumber;
    }
    // Try to use assigned room if available, else pick another eligible room
    let room = eligibleRooms.find(r =>
      r.roomNumber === assignedRoomForCourse &&
      !roomSchedule[day][slot].includes(r.roomNumber)
    );
    if (!room) {
      // Pick any other eligible room not used in this slot
      room = eligibleRooms.find(r => !roomSchedule[day][slot].includes(r.roomNumber));
    }
    if (!room && eligibleRooms.length > 0) {
      // As last resort, pick the first eligible room (even if already used)
      // But only if not already assigned in this slot!
      room = eligibleRooms.find(r => !roomSchedule[day][slot].includes(r.roomNumber));
    }

    // --- CLASH CHECKS ---
    const roomFree = room && !roomSchedule[day][slot].includes(room.roomNumber);
    const teacherFree = !teacher ||
      (!teacherSchedule[day][slot].includes(teacher.shortName) &&
      isTeacherAvailable(teacher, day, slots[slot]));

    if (roomFree && teacherFree) {
      assignedRoomForCourse = room.roomNumber; // stick to this room for this course
      const cell = {
        room: `${room.roomNumber}, ${room.building}`,
        subject: subject.shortName,
        teacher: teacher?.shortName || 'TBA'
      };

      timetable[courseName][day][slot] = cell;
      roomSchedule[day][slot].push(room.roomNumber);

      if (teacher) teacherSchedule[day][slot].push(teacher.shortName);

      perDayPlacement[day] = (perDayPlacement[day] || 0) + 1;
      scheduled++;
      placed = true;
      break;
    }
  }
}
if (placed) break;
// --- END LECTURE ROOM ALLOCATION LOGIC ---   // --- END LECTURE ROOM ALLOCATION LOGIC ---
          }
        }

        if (!placed) break;
      }
    }

    days.forEach((day, dIndex) => {
      timetable[courseName][day] = timetable[courseName][day].map((cell, sIndex) => {
        if (sIndex === 4) return cell; // skip lunch slot
        if (!cell && (sIndex + dIndex) % 2 === 0) {
          return { room: 'Library', subject: 'Library', teacher: '' };
        }
        return cell || { room: 'Library', subject: 'Library', teacher: '' };
      });
    });
  }

  return { timetable, subjectTeachers, days, slots };
}

module.exports = timetableGenerator;