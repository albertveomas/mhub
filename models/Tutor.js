const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const tutorSchema = new Schema({
    tutorId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    sectionId: {
        type: String,
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

module.exports = mongoose.model("tutor", tutorSchema);