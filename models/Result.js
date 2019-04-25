const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const result = new Schema({
    sectionId: {
        type: String,
        required: true
    },
    subjects: {
        type: Array,
        required: true
    },
    messengerId: {
        type: String,
        required: true
    }

})

module.exports = mongoose.model("result", result);