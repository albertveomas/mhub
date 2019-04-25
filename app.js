'use strict';

const dialogflow = require('dialogflow');
const config = require('./config');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');
const mongoose = require('mongoose');
const student = require('./models/Student');
const teacher = require('./models/Teacher');
const tutor = require('./models/Tutor');
const studentFunction = ["View Homework", "Finish Homework", "Timetable", "At Class", "View"]
const StudentView = ["Result", "Alert"]
const teacherFunction = ["Set Homework", "Given Homework", "HW Finished Student", "Start Class"]
const tutorFunction = ["Broadcast Result", "Broadcast Alert", "Broadcast Timetable"]
const timetable = require('./models/Timetable');
const atClass = require('./models/AtClass');
const homework = require('./models/Homework');
const result = require('./models/Result');
const alert = require('./models/Alert');
const cloudinary = require('cloudinary').v2;
const AWS = require('aws-sdk');
const Fs = require('fs');



function loop(array, para, sender) {
    let replies = [];
    let reply;
    array.forEach(current => {
        if (current !== para) {
            reply = {
                "content_type": "text",
                "title": current,
                "payload": current
            }
            replies.push(reply)
        }

    })
    sendQuickReply(sender, "What do you want to do next?", replies)
}


mongoose.connect('mongodb://aung:veomas123@ds143666.mlab.com:43666/mhub', { useNewUrlParser: true });
// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
    throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.GOOGLE_PROJECT_ID) {
    throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!config.DF_LANGUAGE_CODE) {
    throw new Error('missing DF_LANGUAGE_CODE');
}
if (!config.GOOGLE_CLIENT_EMAIL) {
    throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!config.GOOGLE_PRIVATE_KEY) {
    throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!config.FB_APP_SECRET) {
    throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
    throw new Error('missing SERVER_URL');
}



app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
    verify: verifyRequestSignature
}));


// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}));

// Process application/json
app.use(bodyParser.json());



const Polly = new AWS.Polly({
    accessKeyId: "AKIAIUH4P5ESYCAA4XCA",
    secretAccessKey: "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",
    signatureVersion: 'v4',
    region: 'us-east-1'
})
cloudinary.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret,
});


const credentials = {
    client_email: config.GOOGLE_CLIENT_EMAIL,
    private_key: config.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient(
    {
        projectId: config.GOOGLE_PROJECT_ID,
        credentials
    }
);


const sessionIds = new Map();

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    console.log("request");
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function (req, res) {
    var data = req.body;
    console.log(JSON.stringify(data));



    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.optin) {
                    receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});





function receivedMessage(event) {

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }
    //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) {
        handleEcho(messageId, appId, metadata);
        return;
    } else if (quickReply) {
        handleQuickReply(senderID, quickReply, messageId);
        return;
    }


    if (messageText) {
        //send message to api.ai
        sendToDialogFlow(senderID, messageText);
    } else if (messageAttachments) {
        handleMessageAttachments(messageAttachments, senderID);
    }
}


function handleMessageAttachments(messageAttachments, senderID) {
    //for now just reply
    sendTextMessage(senderID, "Attachment received. Thank you.");
}

function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
    //send payload to api.ai
    sendToDialogFlow(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}



function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
    switch (action) {
        case "student-type":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('student-type'))) {
                student.findOne({ messengerId: sender })
                    .then(result => {
                        if (result === null) {
                            sendToDialogFlow(sender, "student")
                        } else {
                            sendTextMessage(sender, "You are already student")
                            setTimeout(() => {
                                loop(studentFunction, "", sender)
                            }, 1000)
                        }

                    })
                    .catch(e => {
                        sendToDialogFlow(sender, "Student")
                    })
            }

            break;
        case "teacher-type":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('teacher-type'))) {
                teacher.findOne({ messengerId: sender })
                    .then(result => {
                        if (result === null) {
                            sendToDialogFlow(sender, "teacher")
                        } else {
                            sendTextMessage(sender, "You are already teacher")
                            setTimeout(() => {
                                loop(teacherFunction, "", sender)
                            }, 1000)
                        }
                    })
                    .catch(e => {

                        sendToDialogFlow(sender, "teacher")
                    })
            }

            break;
        case "tutor-type":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('tutor-type'))) {
                student.findOne({ messengerId: sender })
                    .then(result => {
                        if (result === null) {
                            sendToDialogFlow(sender, "tutor")
                        } else {
                            sendTextMessage(sender, "You are already tutor")
                            setTimeout(() => {
                                loop(tutorFunction, "", sender)
                            }, 1000)
                        }
                    })
                    .catch(e => {

                        sendToDialogFlow(sender, "tutor")
                    })
            }

            break;
        case "broadcast-timetable":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('broadcast-timetable'))) {
                tutor.findOne({ messengerId: sender })
                    .then(result => {
                        student.find({ sectionId: result.sectionId })
                            .then(students => {
                                let reply = [
                                    {
                                        content_type: "text",
                                        title: "View Timetable",
                                        payload: "View Timetable"
                                    }

                                ]
                                students.forEach(current => {
                                    sendQuickReply(current.messengerId, "Timetable is changed. Do you want to view it?", reply)
                                })
                                sendTextMessage(sender, "You have broadcasted timetable to studets")
                                setTimeout(() => {
                                    loop(tutorFunction, "Broadcast Timetable", sender)
                                }, 1000)
                            })
                    })
                    .catch(e => {
                        sendTextMessage(sender, `You are not allowed to broadcast timetable`)
                    })
            }
            break;
        case "view-alert":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('view-alert'))) {

                student.findOne({ messengerId: sender })
                    .then(result => {
                        alert.find({ sectionId: result.sectionId }).sort({ _id: -1 })
                            .then(sorted => {
                                sendTextMessage(sender, `Alert Message is "${sorted[0].message}"`)
                                setTimeout(() => {
                                    loop(studentFunction, "", sender)
                                }, 1000)
                            })

                    })
            }
            break;
        case "broadcast-result":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('broadcast-result'))) {

                tutor.findOne({ messengerId: sender })
                    .then(result => {
                        student.find({ sectionId: result.sectionId })
                            .then(students => {
                                let reply = [
                                    {
                                        content_type: "text",
                                        title: "View Result",
                                        payload: "View Result"
                                    }
                                ]
                                students.forEach(current => {
                                    sendQuickReply(current.messengerId, "Results are out. Do you want to view it?", reply)
                                })
                                sendTextMessage(sender, "You have broadcasted timetable to studets")
                                setTimeout(() => {
                                    loop(tutorFunction, "Broadcast Result", sender)
                                }, 1000)
                            })
                    })
                    .catch(e => {
                        sendTextMessage(sender, `You are not allowed to broadcast result`)
                    })
            }

            break;
        case "broadcast-alert":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('broadcast-alert')) && contexts[0].parameters) {
                let message = (isDefined(contexts[0].parameters.fields['message']) && contexts[0].parameters.fields['message'] != '') ? contexts[0].parameters.fields['message'].stringValue : '';
                tutor.findOne({ messengerId: sender })
                    .then(result => {
                        alert.create({ message, sectionId: result.sectionId })
                            .then(al => {
                                student.find({ sectionId: result.sectionId })
                                    .then(send => {
                                        let reply = [
                                            {
                                                content_type: "text",
                                                title: "View alert",
                                                payload: "View alert"
                                            }
                                        ]
                                        send.forEach(current => {
                                            sendQuickReply(current.messengerId, "You have one alert. Do you want to view it?", reply)
                                        })
                                        sendTextMessage(sender, "You have broadcasted alert to studets")
                                        setTimeout(() => {
                                            loop(tutorFunction, "Broadcast Alert", sender)
                                        }, 1000)
                                    })

                            })
                    })
                    .catch(e => {
                        sendTextMessage(sender, "You are not allowed")
                    })
            } else {
                handleMessages(messages, sender)
            }
            break;
        case "result":

            if (isDefined(contexts[0]) && (contexts[0].name.includes('result'))) {
                let text = "";
                student.findOne({ messengerId: sender })
                    .then(students => {
                        console.log(`sut ${students}`)
                        result.findOne({ messengerId: sender })
                            .then(results => {
                                console.log(`result ${results}`)
                                results.subjects.forEach(current => {
                                    text += current.name
                                    text += `: ${current.marks} \n`

                                })
                                sendTextMessage(sender, text);

                                setTimeout(() => {
                                    loop(studentFunction, "Broadcast Timetable", sender)
                                }, 1000)
                            })
                            .catch(e => {
                                sendTextMessage(sender, "your result with your student id is not found")
                            })
                    })
            }
            break;
        case "view-finished-students":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('view-finished-students')) && contexts[0].parameters) {
                console.log()
                let sectionId = (isDefined(contexts[0].parameters.fields['id']) && contexts[0].parameters.fields['id'] != '') ? contexts[0].parameters.fields['id'].stringValue : '';
                let subject = (isDefined(contexts[0].parameters.fields['subject']) && contexts[0].parameters.fields['subject'] != '') ? contexts[0].parameters.fields['subject'].stringValue : '';
                let title = (isDefined(contexts[0].parameters.fields['title']) && contexts[0].parameters.fields['title'] != '') ? contexts[0].parameters.fields['title'].stringValue : '';
                let elements = []
                let allstud = []
                let hwstudents = []
                teacher.findOne({ messengerId: sender })
                    .then(result => {
                        
                        homework.findOne({ sectionId, subject, title, teacherId: sender })
                            .then(homeworks => {
                                console.log(`type ${typeof homeworks}`)
                                console.log(`homeworks ${homeworks}`)
                                if (homeworks === null) {
                                    console.log(`this`)
                                    sendTextMessage(sender, "Homework no found")
                                    setTimeout(() => {
                                        loop(teacherFunction, "HW Finished Student", sender)
                                    }, 1000)
                                } else {
                                    if(homeworks.students.length === 0){
                                        sendTextMessage(sender, "No student Finish homework")
                                    }
                                    console.log(`homeworks ${homeworks}`)
                                    student.find({ sectionId }).then(res => {
                                      
                                        res.forEach(current => {
                                          
                                            allstud.push(current)
                                        })
                                        homeworks.students.forEach(current => {
                                            
                                           
                                                console.log(`all ${allstud}`)
                                                allstud.forEach(all => {
                                                    if (current === all.messengerId) {
                                                        let element = {
                                                            "image_url": "https://theadsgroup.com/content/uploads/2012/12/unicorn-wallpaper.jpg",
                                                            "title": `ID: ${all.studentId}`,
                                                            "subtitle": `name: ${all.name}`
                                                        }
                                                        elements.push(element);
                                                    }
                                                })
                                                // if (st === allstud[i].messengerId) {

                                                // }
                                                console.log(`element ${JSON.stringify(elements)}`)
                                                sendGenericMessage(sender, elements)
                                                setTimeout(() => {
                                                    loop(teacherFunction, "HW Finished Student", sender)
                                                }, 1000)
                                            

                                        })
                                    })
                                }




                                // if (elements.length > 0) {
                                //     sendTextMessage(sender, "Homework Finished Students Are")
                                //     sendGenericMessage(sender, elements)
                                //     setTimeout(() => {
                                //         loop(teacherFunction, "HW Finished Student", sender)
                                //     }, 1000)
                                // }
                            })
                            .catch(e => {
                                sendTextMessage(sender, "No Homework found")
                                setTimeout(() => {
                                    loop(teacherFunction, "HW Finished Student", sender)
                                }, 1000)
                            })
                    })
            } else {
                handleMessages(messages, sender);
            }

            break;
        case "timetable":

            if (isDefined(contexts[0]) && (contexts[0].name.includes('timetable-output'))) {
                console.log('timetable')
                student.findOne({ messengerId: sender })
                    .then(result => {
                        console.log('student finds')
                        timetable.findOne({ sectionId: result.sectionId })
                            .then(timetables => {
                                console.log('time found')
                                let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
                                let elements = [];

                                timetables.date.forEach((current, i, arr) => {
                                    let element = {
                                        "title": `${days[i]}`,
                                        "subtitle": `Time1: ${current.time1}\nTime2: ${current.time2}\nTime3: ${current.time3}\nTime4: ${current.time4}`
                                    }
                                    elements.push(element);
                                })
                                sendTextMessage(sender, "Timetable is")
                                sendGenericMessage(sender, elements)
                                setTimeout(() => {
                                    loop(studentFunction, "Timetable", sender)
                                }, 1000)

                            })
                            .catch(e => {
                                console.log(e);
                            })
                    })
                    .catch(e => {
                        sendTextMessage(sender, "You are not allowed to view timetable")

                    })
            }
            break;
        case "class-start":

            if (isDefined(contexts[0]) && (contexts[0].name.includes('class-output')) && contexts[0].parameters) {
                let sectionId = (isDefined(contexts[0].parameters.fields['id']) && contexts[0].parameters.fields['id'] != '') ? contexts[0].parameters.fields['id'].stringValue : '';
                teacher.findOne({ messengerId: sender }).then(result => {
                    let date = new Date();
                    let day = date.getDay();
                    let dateString = date.toDateString();
                    let time = getTime();  // time1
                    let check = false;
                    let subj;
                    let waitingTime = 0;
                    let elements = []
                    let studentArr = []

                    result.section.forEach(current => {
                        if (current.name === sectionId) {
                            subj = current.subject;
                            check = true
                        }
                    })

                    if (check) {
                        console.log(`check ${check}`)
                        if (time) {
                            console.log(`time ${time}`)
                            timetable.findOne({ sectionId })
                                .then(timetables => {
                                    let sub = timetables.date[day - 1][time];
                                    if (sub === subj) {
                                        atClass.findOne({ sectionId, date: dateString, time })
                                            .then(atClasses => {


                                                student.find({ sectionId: sectionId }).then(res => {

                                                    res.forEach(current => {
                                                        studentArr.push(current)
                                                    })
                                                    sendTypingOn(sender)
                                                    if (atClasses.students.length === 0) {
                                                        sendTypingOff(sender)
                                                        sendTextMessage(sender, "No students in your class")
                                                    }
                                                    atClasses.students.forEach(first => {
                                                        studentArr.forEach(second => {

                                                            if (first.messengerId == second.messengerId) {

                                                                let element = {
                                                                    "title": `Title: ${second.name}`,
                                                                    "image_url": "https://theadsgroup.com/content/uploads/2012/12/unicorn-wallpaper.jpg",
                                                                    "subtitle": `StudentId: ${second.studentId}\nRow: ${first.row}\nColumn: ${first.column}`,
                                                                    "buttons": [
                                                                        {
                                                                            "type": "postback",
                                                                            "title": "Notify",
                                                                            "payload": `Notify+${first.messengerId}`
                                                                        }
                                                                    ]
                                                                }
                                                                elements.push(element);
                                                            }
                                                        })
                                                    })
                                                    console.log(`ele ${JSON.stringify(elements)}`)
                                                    sendTypingOff(sender)
                                                    sendGenericMessage(sender, elements)
                                                })



                                            })
                                            .catch(e => {
                                                sendTextMessage(sender, "No Student found in your class")
                                            })
                                    } else {
                                        sendTextMessage(sender, "You don't have subject")
                                    }
                                })
                        } else {
                            sendTextMessage(sender, "You can't start over school time")
                        }

                    } else {
                        sendTextMessage(sender, "You have no section that you typed")
                    }
                })
                    .catch(e => {
                        sendTextMessage(sender, "You are not allowed to start class")
                    })
            } else {
                handleMessages(messages, sender)
            }
            break;
        case "given-homework":
            console.log(`conte ${contexts[0].name}`)
            if (isDefined(contexts[0]) && (contexts[0].name.includes('given-homework-output')) && contexts[0].parameters) {
                let sectionId = (isDefined(contexts[0].parameters.fields['id']) && contexts[0].parameters.fields['id'] != '') ? contexts[0].parameters.fields['id'].stringValue : '';
                console.log(`section ${sectionId}`)
                let date = new Date();
                let newArr = []
                console.log(`this works`)
                teacher.findOne({ messengerId: sender })
                    .then(result => {
                        homework.find({ sectionId, teacherId: sender }, (err, res) => {


                            res.forEach(current => {
                                if (current.deadline > date) {
                                    newArr.push(current);
                                }
                            })

                        })

                            .then(arr => {
                                console.log(`aa ${newArr}`)
                                console.log('abcdef')
                                if (newArr.length > 0) {
                                    let elements = []
                                    newArr.forEach(current => {
                                        let element = {
                                            "title": `Title: ${current.title}`,
                                            "subtitle": `Subject: ${current.subject}\n Deadline: ${current.deadline.toDateString()}`

                                        };
                                        elements.push(element);
                                    })
                                    sendTextMessage(sender, `Given Homeworks in section "${sectionId}" are `);
                                    sendGenericMessage(sender, elements)
                                    setTimeout(() => {
                                        loop(teacherFunction, "Given Homework", sender)
                                    }, 1000)
                                } else {
                                    sendTextMessage(sender, `You don't have any homework with the Section Id "${sectionId}"`)
                                    setTimeout(() => {
                                        loop(teacherFunction, "Given Homework", sender)
                                    }, 1000)
                                }
                            })

                            .catch(e => {
                                sendTextMessage(sender, `You don't have any homework with the Section Id ${sectionId}`)
                            })
                    })
                    .catch(e => {
                        sendTextMessage(sender, "You are not allowed to view given homework")
                    })
            } else {
                handleMessages(messages, sender)
            }

            break;
        case "finish-homework":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('finish-homework')) && contexts[0].parameters) {
                let subject = (isDefined(contexts[0].parameters.fields['subject']) && contexts[0].parameters.fields['subject'] != '') ? contexts[0].parameters.fields['subject'].stringValue : '';
                let title = (isDefined(contexts[0].parameters.fields['title']) && contexts[0].parameters.fields['title'] != '') ? contexts[0].parameters.fields['title'].stringValue : '';

                let elements = [];
                student.findOne({ messengerId: sender })
                    .then(result => {
                        console.log('work')
                        homework.findOne({ sectionId: result.sectionId, subject, title })
                            .then(res => {
                                if (res === null) {
                                    let reply = [
                                        {
                                            "content_type": "text",
                                            "title": "View Homework",
                                            "payload": "View Homework"
                                        }
                                    ]
                                    sendTextMessage(sender, "Not Result Found")
                                    sendQuickReply(sender, "Do you want to view what homework is given?", reply)

                                } else {
                                    console.log(res);
                                    if (res.students.includes(sender)) {
                                        let element = {
                                            "title": `Title: ${res.title}`,
                                            "subtitle": `Subject: ${res.subject}\n Deadline: ${res.deadline.toDateString()}\nFinish: Yes`,

                                        }

                                        elements.push(element)


                                    } else {
                                        let element = {
                                            "title": `Title: ${res.title}`,
                                            "subtitle": `Subject: ${res.subject}\n Deadline: ${res.deadline.toDateString()}\nFinish: No`,
                                            "buttons": [
                                                {
                                                    type: "postback",
                                                    title: "Finish",
                                                    payload: `Finish+${title}+${subject}+${result.sectionId}`
                                                }
                                            ]
                                        }
                                        elements.push(element)
                                    }

                                    sendTextMessage(sender, "Result found")
                                    sendGenericMessage(sender, elements)
                                    setTimeout(() => {
                                        loop(studentFunction, "Finish Homework", sender)
                                    }, 1000)
                                }


                            }
                            )
                    })
                    .catch(e => {
                        sendTextMessage(sender, "You are not allowed to performed this function")
                    })

            } else {
                handleMessages(messages, sender)
            }
            break;
        case "view-homework":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('view-homework-out'))) {

                let date = new Date();
                let newArr = []
                student.findOne({ messengerId: sender }).then(result => {
                    homework.find({ sectionId: result.sectionId }, (err, res) => {
                        res.forEach(current => {
                            console.log(`abab ${current.deadline > date}`)
                            console.log(`acac ${current.students.includes(sender)}`)
                            if (current.deadline > date && (current.students.includes(sender) === false)) {

                                newArr.push(current);
                            }
                        })
                    })
                        .then(found => {
                            console.log(`newArr ${newArr}`)
                            if (newArr.length === 0) {

                                sendTextMessage(sender, "You have no homework")
                                setTimeout(() => {
                                    loop(studentFunction, "View Homework", sender)
                                }, 1000)
                            } else {
                                let elements = [];
                                newArr.forEach(current => {
                                    let element = {
                                        "title": `Title: ${current.title}`,
                                        "subtitle": `Subject: ${current.subject}\n Deadline: ${current.deadline.toDateString()}`

                                    };
                                    elements.push(element);
                                })
                                sendTextMessage(sender, "Homework Found")
                                sendGenericMessage(sender, elements);
                                setTimeout(() => {
                                    loop(studentFunction, "View Homework", sender)
                                }, 1000)
                            }

                        })

                })
                    .catch(e => {
                        sendTextMessage(sender, "You are not allowed to view homework")
                    })
            } else {
                handleMessages(messages, sender)
            }

            break;
        case "student-register":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('student-output')) && contexts[0].parameters) {
                let studentId = (isDefined(contexts[0].parameters.fields['id']) && contexts[0].parameters.fields['id'] != '') ? contexts[0].parameters.fields['id'].stringValue : '';
                let voucher = (isDefined(contexts[0].parameters.fields['voucher']) && contexts[0].parameters.fields['voucher'] != '') ? contexts[0].parameters.fields['voucher'].stringValue : '';

                student.findOne({ studentId, voucher }).then(result => {
                    student.updateOne({ studentId }, { $set: { messengerId: sender } }).then(updated => {
                        if (updated.nModified === 1) {
                            sendTextMessage(sender, "You have just registered or updated")
                            setTimeout(() => {
                                loop(studentFunction, " ", sender)
                            }, 1000)
                        } else {
                            sendTextMessage(sender, "You can't update with same facebook account")
                        }
                    })
                })
                    .catch(e => {
                        sendTextMessage(sender, "Student is not match with the voucher")
                    })

            } else {
                handleMessages(messages, sender)
            }
            break;

        case "teacher-register":

            if (isDefined(contexts[0]) && (contexts[0].name.includes('teacher-output')) && contexts[0].parameters) {
                let teacherId = (isDefined(contexts[0].parameters.fields['id']) && contexts[0].parameters.fields['id'] != '') ? contexts[0].parameters.fields['id'].stringValue : '';
                let code = (isDefined(contexts[0].parameters.fields['code']) && contexts[0].parameters.fields['code'] != '') ? contexts[0].parameters.fields['code'].stringValue : '';

                teacher.findOne({ teacherId, code }).then(result => {
                    console.log(`result ${result}`)
                    teacher.updateOne({ teacherId }, { $set: { messengerId: sender } }).then(updated => {
                        if (updated.nModified === 1) {
                            sendTextMessage(sender, "You have just registered or updated")
                            setTimeout(() => {
                                loop(teacherFunction, " ", sender)
                            }, 1000)
                        } else {
                            sendTextMessage(sender, "You can't update with same facebook account")
                        }
                    })

                }).catch(e => {
                    sendTextMessage(sender, "teacherId is not matched with the code")

                })

            } else {
                handleMessages(messages, sender)
            }
            break;

        case "tutor-register":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('tutor-output')) && contexts[0].parameters) {
                let tutorId = (isDefined(contexts[0].parameters.fields['id']) && contexts[0].parameters.fields['id'] != '') ? contexts[0].parameters.fields['id'].stringValue : '';
                let code = (isDefined(contexts[0].parameters.fields['code']) && contexts[0].parameters.fields['code'] != '') ? contexts[0].parameters.fields['code'].stringValue : '';

                tutor.findOne({ tutorId, code }).then(result => {
                    console.log(`reuslt ${result}`)
                    if (result === null) {
                        sendTextMessage(sender, "tutorId is not matched with the code")
                    } else {
                        tutor.updateOne({ tutorId }, { $set: { messengerId: sender } }).then(updated => {
                            console.log(`update ${updated}`)
                            if (updated.nModified === 1) {
                                sendTextMessage(sender, "You have just registered or updated")
                                setTimeout(() => {
                                    loop(tutorFunction, " ", sender)
                                }, 1000)
                            } else {
                                sendTextMessage(sender, "You can't update with same facebook account")

                            }
                        })
                            .catch(e => {
                                sendTextMessage(sender, "tutorId is not matched with the code")
                            })
                    }
                })

            } else {
                handleMessages(messages, sender)
            }
            break;
        case "at-class":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('at-class-output')) && contexts[0].parameters) {
                let dat = new Date();
                let day = dat.getDay();
                let date = dat.toDateString();
                let row = (isDefined(contexts[0].parameters.fields['row']) && contexts[0].parameters.fields['row'] != '') ? contexts[0].parameters.fields['row'].numberValue : '';
                let column = (isDefined(contexts[0].parameters.fields['column']) && contexts[0].parameters.fields['column'] != '') ? contexts[0].parameters.fields['column'].numberValue : '';
                let check = false;
                console.log(row, column)

                if (day === 6 || day === 0) {
                    sendTextMessage(sender, "Today is School Closed Day and You cannot roll call on weekend")
                    setTimeout(() => {
                        loop(studentFunction, "At Class", sender)
                    }, 1000)
                } else {
                    console.log('this works')
                    student.findOne({ messengerId: sender }).then(students => {

                        let time = getTime();
                        console.log(`time is ${time}`);
                        console.log(students.sectionId)
                        if (time) {

                            atClass.findOne({ sectionId: students.sectionId, date, time }).then(result => {

                                result.students.forEach(current => {
                                    if (current.messengerId == sender) {
                                        check = true
                                    }
                                })
                                if (check) {
                                    sendTextMessage(sender, "You have been already added to students who are at class")
                                    setTimeout(() => {
                                        loop(studentFunction, "At Class", sender)
                                    }, 1000)
                                } else {
                                    result.students.push({
                                        messengerId: sender,
                                        row,
                                        column
                                    })
                                    atClass.updateOne({ sectionId: students.sectionId, date, time }, { students: result.students }, function (err, updated) {
                                        if (updated.nModified === 1) {
                                            sendTextMessage(sender, "You are now at class. Teacher will verify soon.")
                                            setTimeout(() => {
                                                loop(studentFunction, "At Class", sender)
                                            }, 1000)
                                        }
                                    })
                                }
                            }).catch(e => {
                                console.log(e);
                                let Students = [
                                    {
                                        messengerId: sender,
                                        row, column
                                    }
                                ]
                                atClass.create({ sectionId: students.sectionId, date, time, students: Students }, (err, create) => {
                                    sendTextMessage(sender, "You are now at class. Teacher will verify soon.")
                                    setTimeout(() => {
                                        loop(studentFunction, "At Class", sender)
                                    }, 1000)
                                })
                            })


                        } else {
                            sendTextMessage(sender, "You don't start roll call over school time")
                            setTimeout(() => {
                                loop(studentFunction, "At Class", sender)
                            }, 1000)
                        }

                    })
                        .catch(e => {

                            sendTextMessage(sender, "You are not allowed")
                        })
                }


            } else {
                handleMessages(messages, sender);
            }
            break;

        case "set-homework":
            if (isDefined(contexts[0]) && (contexts[0].name.includes('set-homework')) && contexts[0].parameters) {
                let sectionId = (isDefined(contexts[0].parameters.fields['id']) && contexts[0].parameters.fields['id'] != '') ? contexts[0].parameters.fields['id'].stringValue : '';
                let subject = (isDefined(contexts[0].parameters.fields['subject']) && contexts[0].parameters.fields['subject'] != '') ? contexts[0].parameters.fields['subject'].stringValue : '';
                let title = (isDefined(contexts[0].parameters.fields['title']) && contexts[0].parameters.fields['title'] != '') ? contexts[0].parameters.fields['title'].stringValue : '';
                let Deadline = (isDefined(contexts[0].parameters.fields['deadline']) && contexts[0].parameters.fields['deadline'] != '') ? contexts[0].parameters.fields['deadline'].stringValue : '';
                let dateNow = new Date();
                let deadline = new Date(Deadline);
                let subjects;



                teacher.findOne({ messengerId: sender }).then(result => {
                    if (deadline > dateNow) {
                        result.section.forEach(current => {
                            if (current.name == sectionId) {
                                subjects = current.subject;
                            }
                        })

                        if (subjects) {
                            if (subjects == subject) {
                                homework.create({ sectionId, title, subject, deadline, teacherId: sender }).then(homeworks => {
                                    let buttons = [
                                        {
                                            type: "postback",
                                            title: "View Homework",
                                            payload: `View-Homework+${title}+${subject}+${sectionId}`
                                        }
                                    ]
                                    console.log(homeworks)
                                    student.find({ sectionId }).then(students => {
                                        students.forEach(current => {
                                            sendButtonMessage(current.messengerId, `You have homework with the title "${title}" on the subject "${subject}". Do you want to View it?`, buttons)

                                        })
                                        sendTextMessage(sender, "Set homework successful")
                                        setTimeout(() => {
                                            loop(teacherFunction, "Set Homework", sender)
                                        }, 1000)
                                    })
                                }

                                )
                            } else {
                                sendTextMessage(sender, "You don't have subject you typed or subject is wrong")
                                setTimeout(() => {
                                    loop(teacherFunction, "Set Homework", sender)
                                }, 1000)
                            }

                        } else {
                            sendTextMessage(sender, "No section Found")
                            setTimeout(() => {
                                loop(teacherFunction, "Set Homework", sender)
                            }, 1000)
                        }
                    } else {
                        sendTextMessage(sender, "You cannot give homework on past date")
                        setTimeout(() => {
                            loop(teacherFunction, "Set Homework", sender)
                        }, 1000)
                    }
                })
                    .catch(e => {
                        sendTextMessage(sender, "You are not allowed to give homework")
                    })

            } else {
                handleMessages(messages, sender)
            }
            break;

        default:
            //unhandled action, just send back the text
            handleMessages(messages, sender);
    }
}


function getTime() {
    let date = new Date();
    let dateString = date.toDateString();
    let nine = new Date(`${dateString} 9:00:00 AM`);
    let tenHalf = new Date(`${dateString} 10:30:00 AM`);
    let tweleve = new Date(`${dateString} 12:00:00 PM`);
    let one = new Date(`${dateString} 1:00:00 PM`);
    let tweHalf = new Date(`${dateString} 2:30:00 PM`);
    let four = new Date(`${dateString} 4:00:00 PM`);



    if (date > nine && date < tenHalf) {
        return "time1"
    } else if (date > tenHalf && date < tweleve) {
        return "time2"
    } else if (date > one && date < tweHalf) {
        return "time3"
    } else if (date > tweHalf && date < four) {
        return "time4"
    } else {
        return "time1"
    }

}

function handleMessage(message, sender) {
    switch (message.message) {
        case "text": //text
            message.text.text.forEach((text) => {
                if (text !== '') {
                    sendTextMessage(sender, text);
                }
            });
            break;
        case "quickReplies": //quick replies
            let replies = [];
            message.quickReplies.quickReplies.forEach((text) => {
                let reply =
                {
                    "content_type": "text",
                    "title": text,
                    "payload": text
                }
                replies.push(reply);
            });
            sendQuickReply(sender, message.quickReplies.title, replies);
            break;
        case "image": //image
            sendImageMessage(sender, message.image.imageUri);
            break;
    }
}


function handleCardMessages(messages, sender) {

    let elements = [];
    for (var m = 0; m < messages.length; m++) {
        let message = messages[m];
        let buttons = [];
        for (var b = 0; b < message.card.buttons.length; b++) {
            let isLink = (message.card.buttons[b].postback.substring(0, 4) === 'http');
            let button;
            if (isLink) {
                button = {
                    "type": "web_url",
                    "title": message.card.buttons[b].text,
                    "url": message.card.buttons[b].postback
                }
            } else {
                button = {
                    "type": "postback",
                    "title": message.card.buttons[b].text,
                    "payload": message.card.buttons[b].postback
                }
            }
            buttons.push(button);
        }


        let element = {
            "title": message.card.title,
            "image_url": message.card.imageUri,
            "subtitle": message.card.subtitle,
            "buttons": buttons
        };
        elements.push(element);
    }
    sendGenericMessage(sender, elements);
}


function handleMessages(messages, sender) {
    let timeoutInterval = 1100;
    let previousType;
    let cardTypes = [];
    let timeout = 0;
    for (var i = 0; i < messages.length; i++) {

        if (previousType == "card" && (messages[i].message != "card" || i == messages.length - 1)) {
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        } else if (messages[i].message == "card" && i == messages.length - 1) {
            cardTypes.push(messages[i]);
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
        } else if (messages[i].message == "card") {
            cardTypes.push(messages[i]);
        } else {

            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        }

        previousType = messages[i].message;

    }
}

function handleDialogFlowResponse(sender, response) {
    let responseText = response.fulfillmentMessages.fulfillmentText;

    let messages = response.fulfillmentMessages;
    let action = response.action;
    let contexts = response.outputContexts;
    let parameters = response.parameters;

    sendTypingOff(sender);

    if (isDefined(action)) {
        handleDialogFlowAction(sender, action, messages, contexts, parameters);
    } else if (isDefined(messages)) {
        handleMessages(messages, sender);
    } else if (responseText == '' && !isDefined(action)) {
        //dialogflow could not evaluate input.
        sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
    } else if (isDefined(responseText)) {
        sendTextMessage(sender, responseText);
    }
}

async function sendToDialogFlow(sender, textString, params) {

    sendTypingOn(sender);

    try {
        const sessionPath = sessionClient.sessionPath(
            config.GOOGLE_PROJECT_ID,
            sessionIds.get(sender)
        );

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: textString,
                    languageCode: config.DF_LANGUAGE_CODE,
                },
            },
            queryParams: {
                payload: {
                    data: params
                }
            }
        };
        const responses = await sessionClient.detectIntent(request);

        const result = responses[0].queryResult;
        handleDialogFlowResponse(sender, result);
    } catch (e) {
        console.log('error');
        console.log(e);
    }

}




function sendTextMessage(recipientId, text) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    }
    callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: imageUrl
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: config.SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId, url) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: config.SERVER_URL + videoName
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: config.SERVER_URL + fileName
                }
            }
        }
    };

    callSendAPI(messageData);
}



/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text,
                    buttons: buttons
                }
            }
        }
    };

    callSendAPI(messageData);
}


function sendGenericMessage(recipientId, elements) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: elements
                }
            }
        }
    };

    callSendAPI(messageData);
}


function sendReceiptMessage(recipientId, recipient_name, currency, payment_method,
    timestamp, elements, address, summary, adjustments) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: recipient_name,
                    order_number: receiptId,
                    currency: currency,
                    payment_method: payment_method,
                    timestamp: timestamp,
                    elements: elements,
                    address: address,
                    summary: summary,
                    adjustments: adjustments
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text,
            metadata: isDefined(metadata) ? metadata : '',
            quick_replies: replies
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: config.SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v3.2/me/messages',
        qs: {
            access_token: config.FB_PAGE_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}



/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;
    var title;
    var subject;
    var sectionId;
    var mId;
    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    if (payload.includes("View-Homework")) {
        let split = payload.split("+");
        payload = split[0];
        title = split[1];
        subject = split[2];
        sectionId = split[3];

        homework.findOne({ sectionId, subject, title }).then(result => {
            sendTextMessage(senderID, `Title: ${result.title} \n Subject: ${result.subject}\n Deadline: ${result.deadline.toDateString()}`)
            setTimeout(() => {
                loop(studentFunction, "View Homework", senderID)
            }, 1000)
        })
    } else if (payload.includes("Finish")) {
        let split = payload.split("+")
        payload = split[0];
        title = split[1];
        subject = split[2];
        sectionId = split[3];
        homework.findOne({ sectionId, subject, title })
            .then(result => {
                console.log(`finish rer ${result}`)
                result.students.push(senderID)
                homework.updateOne({ sectionId, subject, title }, { $set: { students: result.students } })
                    .then(updated => {
                        if (updated.nModified === 1) {
                            sendTextMessage(senderID, `You are added to the students who finished homeworks "${title} of ${subject}"`)
                            setTimeout(() => {
                                loop(studentFunction, "View Homework", senderID)
                            }, 1000)
                        }

                    })
            })
    } else if (payload.includes("GET_STARTED")) {
        sendToDialogFlow(senderID, "hi")
    }
    else if (payload.includes("Notify")) {
        let split = payload.split("+")
        payload = split[0]
        mId = split[1]

        const date = new Date();
        const dateString = date.toDateString()
        const local = date.toLocaleTimeString()
        sendTextMessage(mId, "You are notified")
        student.findOne({ messengerId: mId })
            .then(result => {
                console.log(`result ${result}`)
                let params = {
                    'Text': `${result.name} ${dateString} ${local}`,
                    'OutputFormat': 'mp3',
                    'VoiceId': 'Kimberly'
                }
                Polly.synthesizeSpeech(params, (err, data) => {
                    if (err) {
                        console.log(err.code)
                    } else if (data) {
                        if (data.AudioStream instanceof Buffer) {

                            Fs.writeFile(`./data/speech.mp3`, data.AudioStream, function (err) {
                                if (err) {
                                    return console.log(err)
                                }
                                console.log("The file was saved!")
                            })

                        }
                    }
                })

                console.log(`mid ${mId}`)
                sendTypingOn(senderID)
                setTimeout(() => {
                    cloudinary.uploader.upload(`./data/speech.mp3`,
                        {
                            resource_type: "video", public_id: `${result.name} ${dateString}${local}`,
                            overwrite: false, notification_url: "https://mcchub.herokuapp.com/"
                        },
                        function (error, results) {
                            console.log(`audio ${JSON.stringify(results)}`);
                            console.log(`url ${JSON.stringify(results.url)}`);

                            sendAudioMessage(mId, results.url);
                            sendTypingOff(senderID)
                            sendTextMessage(senderID, "Audio sent")

                        });


                }, 2000)

            })
    }
    else {
        sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
    }



    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

}


/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    console.log("Received message read event for watermark %d and sequence " +
        "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log("Received account link event with for user %d with status %s " +
        "and auth code %s ", senderID, status, authCode);
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function (messageID) {
            console.log("Received delivery confirmation for message ID: %s",
                messageID);
        });
    }

    console.log("All message before %d were delivered.", watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " +
        "through param '%s' at %d", senderID, recipientID, passThroughParam,
        timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        throw new Error('Couldn\'t validate the signature.');
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(buf)
            .digest('hex');

        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

// Spin up the server
app.listen(app.get('port'), function () {
    console.log('running on port', app.get('port'))
})
