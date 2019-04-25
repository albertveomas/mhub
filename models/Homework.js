const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const homework = new Schema({
    sectionId: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required:true
    },
    deadline: {
        type: Date,
        required: true
    },
    students: {
        type: Array
    },
    teacherId: {
        type: String,
        required: true
    }

})

module.exports = mongoose.model("homework", homework);