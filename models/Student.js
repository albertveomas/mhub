const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const StudentSchmea = new Schema({
    studentId: {
        type: Number,
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
        type:String
    },
    img: {
        type: String
    },
    voucher: {
        type: String,
        required: true
    }
  
})

module.exports = mongoose.model("Student", StudentSchmea);