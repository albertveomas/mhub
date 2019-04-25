const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const teacherSchema = new Schema({
    teacherId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    section: {
        type: Array,
        required: true
    },
    messengerId: {
        type: String
    },
    code: {
        type: String,
        required: true
    }

})

module.exports = mongoose.model("teacher", teacherSchema);