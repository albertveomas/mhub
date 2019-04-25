const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const atClass = new Schema({
    sectionId: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    students: {
        type: Array,
        required: true
    }

})

module.exports = mongoose.model("at-class", atClass);