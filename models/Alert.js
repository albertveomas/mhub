const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema

const alert = new Schema({
   sectionId: {
       type: String,
       required: true
   },
   message: {
       type: String,
       required: true
   }

})

module.exports = mongoose.model("alert", alert);