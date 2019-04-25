const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const timetable = new Schema({
    sectionId: {
        type: String,
        required: true
    },
    date: {
        type: Array,
        required: true
    }

})

module.exports = mongoose.model("Timetable", timetable);