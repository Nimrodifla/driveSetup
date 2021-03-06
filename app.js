const express = require("express");
const fs = require('fs');
const cookieParser = require('cookie-parser');
var mysql = require('mysql');
var app = express();

app.use(cookieParser());

const db = mysql.createPool({
        
    host: "eu-cdbr-west-02.cleardb.net",
    user: "ba27ffeb2757ff",
    password: "8882ff46",
    database: "heroku_11549fe01367124"
});

const ID_LEN = 10;
const LINK_LEN = 6;
const DB_PATH = "./db.txt";

var prevDrives = '';
var prevLinks = '';

var DRIVES = {};
var LINKS = {};

function createLinkForDrive(driveId)
{
    let link = makeid(LINK_LEN);
    LINKS[link] = driveId;
    DRIVES[driveId].linkId = link;
}

function replaceTemp(html, src, dst)
{
    while (html.includes(src))
    {
        html = html.replace(src, dst);
    }

    return html;
}

function htmlToString(path)
{
    return String(fs.readFileSync(path));
};

function loadFromDatabase()
{

    db.query("SELECT data FROM info WHERE id = 0;", (err, result)=>{
        if (err)
            throw err;
        
        let res = result[0].data;
        DRIVES = JSON.parse(res);

        db.query("SELECT data FROM info WHERE id = 1;", (err, result)=>{
            if (err)
                throw err;
            
            let res = result[0].data;
            LINKS = JSON.parse(res);

            console.log("Data Loaded!");
        });
    });
}

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function ramdomInt(min, max)
{
    return Math.floor((Math.random() * max) + min);
}

function getUsersInDrive(driveId)
{
    let userList = []
    let users = DRIVES[driveId].users;
    for (let i in users)
    {
        let u = users[i];
        let res = u.name;
        if (u.howMuch > 0)
            res += " 🚗";
        userList.push(res);
    }

    return userList;
}

function isIdInSystem(userId)
{
    let found = false;
    for (let key in DRIVES)
    {
        let val = DRIVES[key];
        for (let i in val.users)
        {
            let u = val.users[i];
            if (u.id == userId)
            {
                found = true;
                break;
            }
        }
    }

    return found;
}

function userViewPage(userId)
{
    // find driveId
    let driveId = undefined;

    for (let key in DRIVES)
    {
        let val = DRIVES[key];
        let users = val.users;
        for (let i in users)
        {
            let u = users[i];
            if (u.id == userId)
            {
                driveId = key;
                break;
            }
        }
    }

    let userList = getUsersInDrive(driveId).join('<br>');

    let html = htmlToString(__dirname + '/user_view.html');
    html = replaceTemp(html, '#users#', userList);
    html = replaceTemp(html, '#name#', DRIVES[driveId].driveName);
    html = replaceTemp(html, '#linkId#', DRIVES[driveId].linkId);
    if (DRIVES[driveId].setuped)
        html = replaceTemp(html, '#setup#', JSON.stringify(DRIVES[driveId].setup));
    else
        html = replaceTemp(html, '#setup#', '[]');
    
    return html;
}

app.get('/favicon.ico', (req, res)=>{
    res.sendFile(__dirname + '/favicon.ico');
});

// create drive
app.get("/", (req, res)=>{
    let userId = req.cookies.id;

    if (userId == undefined)
    {
        // user is new - make him an id
        res.cookie("id", makeid(ID_LEN));
        res.sendFile(__dirname + "/create.html");
    }
    else if (!isIdInSystem(userId))
    {
        res.cookie("id", userId);
        res.sendFile(__dirname + "/create.html");
    }
    else
    {
        // user has an id - lets find what is he
        // does user own a drive?
        let found = false;
        for (let key in DRIVES)
        {
            let val = DRIVES[key];
            if (val.ownerId == userId)
            {
                // user owns this drive
                let driveId = key;
                let html = driveCreatedPage(driveId);
                found = true;
                res.cookie("id", userId);
                res.send(html);
                break;
            }
        }
        if (!found)
        {
            // lets check if user is IN a drive
            for (let key in DRIVES)
            {
                let val = DRIVES[key];
                let users = val.users
                for (let i in users)
                {
                    let u = users[i];
                    if (u.id == userId)
                    {
                        // user is in this drive
                        found = true;
                        // send him the page to look at the drive
                        res.cookie("id", userId);
                        res.send(userViewPage(userId));
                        break;
                    }
                }
            }
            if (!found)
            {
                // user didnt found, treat him as new
                res.cookie("id", makeid(ID_LEN));
                res.sendFile(__dirname + "/create.html");
            }
        }
    }

    saveToDatabase();
});

function driveCreatedPage(driveId)
{
    let html = htmlToString(__dirname + '/drive_created.html');
    html = replaceTemp(html, '#linkId#', DRIVES[driveId].linkId);
    html = replaceTemp(html, "#name#", DRIVES[driveId].driveName);
    html = replaceTemp(html, '#users#', getUsersInDrive(driveId).join("<br>"));
    if (DRIVES[driveId].setuped)
        html = replaceTemp(html, '#setup#', JSON.stringify(DRIVES[driveId].setup));
    else
        html = replaceTemp(html, '#setup#', '[]');

    return html;
}

function addUserToDrive(driveId, userId, username, howMuch)
{
    DRIVES[driveId].users.push({'name': username, 'id': userId, 'howMuch': howMuch});
}

// req to create drive
app.get("/create/:name/:username/:howmuch", (req, res)=>{
    let userId = req.cookies.id;
    let driveName = req.params.name;
    let username = req.params.username;
    let howMuch = req.params.howmuch;

    if (userId == undefined)
    {
        // user is new - make him an id
        res.cookie("id", makeid(ID_LEN));
    }
    else
    {
        // create
        let driveId = ramdomInt(1, 1000000).toString();
        DRIVES[driveId] = {'linkId': undefined, 'ownerId': userId, 'driveName': driveName, 'users': [], 'setuped': false};
        addUserToDrive(driveId, userId, username, howMuch);
        createLinkForDrive(driveId);

        console.log(driveId);
        console.log(DRIVES[driveId]);

        res.cookie("id", userId);
    }
    res.sendFile(__dirname + '/main.html');
});

function joinPage(driveIdToJoin)
{
    let drive = DRIVES[driveIdToJoin];

    let html = htmlToString(__dirname + '/join.html');
    html = replaceTemp(html, '#name#', drive.driveName);
    let userList = getUsersInDrive(driveIdToJoin).join('<br>');
    html = replaceTemp(html, '#users#', userList);
    html = replaceTemp(html, '#driveId#', driveIdToJoin);

    return html;
}

// user asks to join a drive
app.get("/join/:id", (req, res)=>{
    let link = req.params.id;
    let driveId = LINKS[link];
    let userId = req.cookies.id;

    if (driveId == undefined && userId == undefined)
    {
        // means the user doesnt have a form filled
        res.cookie("id", makeid(ID_LEN));
        res.sendFile(__dirname + '/main.html');
    }
    else if (driveId == undefined)
    {
        res.cookie('id', userId);
        res.sendFile(__dirname + '/main.html');
    }
    else if (userId == undefined)
    {
        // means the user doesnt have a form filled
        res.cookie('id', makeid(ID_LEN));
        res.send(joinPage(driveId));
    }
    else if (isIdInSystem(userId))
    {
        res.cookie("id", userId);
        res.sendFile(__dirname + '/main.html');
    }
    else
    {
        res.cookie('id', userId);
        res.send(joinPage(driveId));
    }
});

app.get('/joinreq/:name/:howmuch/:driveid', (req, res)=>{
    let username = req.params.name;
    let howMuch = req.params.howmuch;
    let driveId = req.params.driveid;

    let userId = req.cookies.id;
    if (userId == undefined)
    {
        // user is new - make him an id
        res.cookie("id", makeid(ID_LEN));
    }
    else
    {
        addUserToDrive(driveId, userId, username, howMuch);
        res.cookie("id", userId);
    }
    res.sendFile(__dirname + "/main.html");
});

function setupDrive(driveId)
{
    let cars = []; // result: [{driver: ..., passengers: [..., ..., ...]}, ...]
    const MAX_USERS_IN_CAR = 3;
    let drivers = [];

    let drive = DRIVES[driveId];

    let howManyUsers = drive.users.length;
    let howManyCarsNeeded = Math.ceil(howManyUsers / MAX_USERS_IN_CAR);
    // find all drivers
    for (let i in drive.users)
    {
        let u = drive.users[i];
        if (u.howMuch > 0)
        {
            drivers.push(u);
        }
    }
    // sort drivers from the driver who wants the most to the least
    drivers = drivers.sort((a, b)=>{
        return b.howMuch - a.howMuch;
    });

    let howManyCarsWeHave = drivers.length;
    if (howManyCarsWeHave >= howManyCarsNeeded)
    {
        // we have enough drivers!
        let actualDrivers = []; // the drivers who will drive
        for (let i = 0; i < howManyCarsNeeded; i++)
        {
            let d = drivers[i];
            actualDrivers.push(d);
            cars.push({'driver': d, 'backseat': []});
        }

        // calcualte who are the users that need a seat and are not a driver
        let backseaters = [];
        for (let i in drive.users)
        {
            let u = drive.users[i];
            if (!actualDrivers.includes(u))
            {
                // user isn't an actual driver
                backseaters.push(u); // add him to the backseaters
            }
        }

        // shuffle array so we'll make it random
        backseaters.sort(()=>{return Math.random() - 0.5});
        
        // now, assign (MAX_USERS_IN_CAR - 1) backseaters to each driver
        let backseatersIndex = 0;

        for (let i in cars)
        {
            for (let j = 0; j < (MAX_USERS_IN_CAR - 1); j++, backseatersIndex++)
            {
                cars[i].backseat.push(backseaters[backseatersIndex]);
            }
        }

        // we're done! lets mark this drive as: setuped
        DRIVES[driveId].setuped = true;
        // and add this setup to the drive so we'll remember it
        DRIVES[driveId]['setup'] = cars;
    }

    return cars; // optinal
}

app.get('/setup', (req, res)=>{
    let userId = req.cookies.id;

    if (userId == undefined)
    {
        // user is new - make him an id
        res.cookie("id", makeid(ID_LEN));
    }
    else if (!isIdInSystem(userId))
    {
        res.cookie("id", userId);
    }
    else
    {
        // lets find what drive this user owns
        let driveId = undefined;
        for (let key in DRIVES)
        {
            let val = DRIVES[key];
            if (val.ownerId == userId)
            {
                driveId = key;
                break;
            }
        }
        // user acually owns a drive
        if (driveId != undefined)
        {
            setupDrive(driveId);
        }
        res.cookie("id", userId);
    }
    res.sendFile(__dirname + "/main.html");
})

app.get('/leave', (req, res)=>{
    let userId = req.cookies.id;
    if (userId == undefined)
    {
        // user is new - make him an id
        res.cookie("id", makeid(ID_LEN));
    }
    else if (!isIdInSystem(userId))
    {
        res.cookie("id", userId);
    }
    else
    {
        for (let key in DRIVES)
        {
            let found = false;
            for (let i in DRIVES[key].users)
            {
                if (DRIVES[key].ownerId == userId) // user is owning this drive
                {
                    // delete drive
                    let link = DRIVES[key].linkId;
                    delete DRIVES[key];
                    delete LINKS[link];
                    found = true;
                    break;
                }

                if (DRIVES[key].users[i].id == userId) // user is in that drive
                {
                    // so we'll remove him from there
                    DRIVES[key].users.splice(i, 1);
                    found = true;
                    break;
                }
            }
            if (found)
            {
                break;
            }
        }

        res.cookie("id", userId);
    }
    res.sendFile(__dirname + "/main.html");
})

app.get('/cancel', (req, res)=>{
    let userId = req.cookies.id;
    if (userId == undefined)
    {
        // user is new - make him an id
        res.cookie("id", makeid(ID_LEN));
    }
    else if (!isIdInSystem(userId))
    {
        res.cookie("id", userId);
    }
    else
    {
        let driveId = undefined;
        for (let key in DRIVES)
        {
            let val = DRIVES[key];
            if (val.ownerId == userId)
            {
                driveId = key;
                break;
            }
        }

        if (driveId != undefined)
        {
            DRIVES[driveId].setuped = false;
        }
        res.cookie("id", userId);
    }
    res.sendFile(__dirname + "/main.html");
});

app.get('/style.css', (req, res)=>{
    res.sendFile(__dirname + '/style.css');
})

function saveToDatabase()
{
    let drivesData = JSON.stringify(DRIVES);
    if (drivesData != prevDrives)
    {
        db.query("UPDATE info SET data = '" + drivesData + "' WHERE id = 0", (err, result)=>{
            if (err)
                throw err;
            
            prevDrives = drivesData;
            let linksData = JSON.stringify(LINKS);
            if (linksData != prevLinks)
            {
                db.query("UPDATE info SET data = '" + linksData + "' WHERE id = 1", (err, result)=>{
                    if (err)
                        throw err;
        
                    console.log("Data Saved!");
                });
            }
            prevLinks = linksData;
        });
    }
}

app.listen(process.env.PORT || 80, (err)=>{
    if (err)
        throw err

    loadFromDatabase()
    console.log("App is On!")
});