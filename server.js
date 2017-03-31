var app = require("express")();
var http = require("http").Server(app);
var io = require("socket.io")(http);
var fs = require("fs");
var mkdirp = require("mkdirp");
var robotver = [[], []];
var userlist = [];
var privateGroupList = [];
var msglog = [];
var maxPrivateGroupId = 0;

mkdirp("data/private/read/", function (err) {
    if (err) console.error(err)
});

if(fs.existsSync("data/userlog"))
{
  fs.readFile("data/userlog", "utf8", function (err, userlog) {
    if(err) console.log(err);
    else {
      userlog = userlog.split("\n");
      userlog.pop();
      for(i in userlog)
      {
        userlog[i] = userlog[i].split("\t");
        userlist.push({ "username"     : userlog[i][0],
                        "password"     : userlog[i][1],
                        "email"        : userlog[i][2],
                        "key"          : null,
                        "socket"       : null,
                        "privateGroups": [],
                        "publicGroups" : [],
                        "currentGroup" : {"type": "none", "groupid": "none"} });
      }

      if(fs.existsSync("data/private/privategroups"))
      {
        fs.readFile("data/private/privategroups", "utf8", function (err, grouplog) {
          if(err) console.log(err);
          else {
            grouplog = grouplog.split("\n");
            grouplog.pop();
            for(i in grouplog)
            {
              grouplog[i] = grouplog[i].split("\t");
              var index1 = userlist.map(function(o) { return o.username; }).indexOf(grouplog[i][0]);
              var index2 = userlist.map(function(o) { return o.username; }).indexOf(grouplog[i][1]);
              userlist[index1].privateGroups.push({ "username": grouplog[i][1], "groupid": i.toString() });
              userlist[index2].privateGroups.push({ "username": grouplog[i][0], "groupid": i.toString() });

              console.assert(fs.existsSync("data/private/" + i) , i + " doesn't exist!");
              console.assert(fs.existsSync("data/private/read/" + i) , i + " doesn't exist!");
              (function(i) {
                fs.readFile("data/private/" + i, "utf8", function (err, chatdata) {
                  if(err) console.log(err);
                  else {
                    fs.readFile("data/private/read/" + i, "utf8", function (err, data) {
                      if(err) console.log(err);
                      else {
                        var chatlog = [];
                        chatdata = chatdata.split("\v");
                        chatdata.pop();
                      
                        for(j in chatdata) {
                          chatdata[j] = chatdata[j].split("\t");
                          chatlog.push({ "username": chatdata[j][0],
                                         "msg"     : chatdata[j][1],
                                         "time"    : new Date(chatdata[j][2]) });
                        }

                        data = data.split("\n");
                        data.pop();
                        privateGroupList.push({ "groupid": i.toString(),
                                                "user"   : [{ "username": grouplog[i][0], "start": Number(data[0]) },
                                                            { "username": grouplog[i][1], "start": Number(data[1]) }],
                                                "chatlog": chatlog });
                      }
                    });
                  }
                });
              }) (i);
            }
            maxPrivateGroupId = grouplog.length;

            console.log("userlist: ");
            console.log(userlist);
          }
        });
      }
      else
      {
        console.log("userlist: ");
        console.log(userlist);
      }
    }
  });
}

app.get("/", function(req, res){
  res.sendFile(__dirname + "/chat.html");
});

app.get("/login", function(req, res){
  res.sendFile(__dirname + "/login.html");
});

app.get("/reg", function(req, res){
  res.sendFile(__dirname + "/reg.html");
});

app.get("/reg_finish", function(req, res){
  res.sendFile(__dirname + "/regfinish.html");
});

http.listen(3000, function(){
  console.log("listening on *:3000");
});

function compare(a,b) {
  if(a.newmsg != b.newmsg) {
    if(a.newmsg) return 1;
    else return -1;
  }
  else if(a.msg != null) {
    if(a.time > b.time) return 1;
    else return -1;
  }
  else if(a.useronline != b.useronline) {
    if(a.useronline) return 1;
    else return -1;
  }
  else if(a.username > b.username) return 1;
  else return -1;
}

io.on("connection", function(socket){

  console.log('New client (id=' + socket.id + ').');

  socket.on("login", function(username, password) {
    if(username == "" || password == "")
    {
      socket.emit("login", "empty", "");
    }
    else
    {
      var index = userlist.map(function(o) { return o.username; }).indexOf(username);
      if(index == -1) socket.emit("login", "invalid");
      else if(userlist[index].password != password) socket.emit("login", "invalid");
      else {
        if(userlist[index].socket != null) userlist[index].socket.emit("login verify", "invalid");
        userlist[index].key = socket.id;
        userlist[index].socket = null;
        socket.emit("login", "valid", username, socket.id);
      }
    }
  });

  socket.on("login verify", function(username, key) {
    var index = userlist.map(function(o) { return o.username; }).indexOf(username);
    if(index == -1) socket.emit("login verify", "invalid");
    else if(userlist[index].key != key) socket.emit("login verify", "invalid");
    else
    {
      userlist[index].socket = socket;

      var alluser = [];
      for(i in userlist)
        if(i != index)
        {
          var newmsg = false;
          var msg = null;
          var time = null;
          var index2 = userlist[index].privateGroups.map(function(o) { return o.username; }).indexOf(userlist[i].username);
          if(index2 != -1) { 
            var groupindex = privateGroupList.map(function(o) { return o.groupid; }).indexOf(userlist[index].privateGroups[index2].groupid);
            for(j in privateGroupList[groupindex].user)
              if(privateGroupList[groupindex].user[j].username == username)
                newmsg = (privateGroupList[groupindex].user[j].start != privateGroupList[groupindex].chatlog.length);
            var last = privateGroupList[groupindex].chatlog.length - 1;
            if(last != -1)
            {
              msg = privateGroupList[groupindex].chatlog[last].msg;
              time = privateGroupList[groupindex].chatlog[last].time;
            }
          }
          alluser.push({ "username": userlist[i].username,
                         "newmsg"  : newmsg,
                         "msg"     : msg,
                         "time"    : time,
                         "online"  : userlist[i].socket != null });
          if(userlist[i].socket != null)
            userlist[i].socket.emit("refresh online user", "online", { "username": username, "state": true });
        }

      alluser.sort(compare);
      socket.emit("login verify", "valid", alluser);
    }
  });


  socket.on("robot", function() {
    var obj = Math.floor(Math.random() * 4);
    var rtn = [];
    for(i=0; i<4; ++i)
      if(i == obj) rtn.push("I am not a robot");
      else rtn.push("I am a robot");

    robotver[0].push(socket.id);
    robotver[1].push(obj);
    socket.emit("robot", rtn);
  });

  socket.on("check account", function(username) {
    if(username == "") socket.emit("check account", "empty");
    else
    {
      var index = userlist.map(function(o) { return o.username; }).indexOf(username);
      if(index == -1) socket.emit("check account", "valid");
      else socket.emit("check account", "invalid");
    }
  });

  socket.on("reg", function(username, password, emailaddr, robot) {
    var acc_valid = "empty";
    var index;
    if(username != "")
    {
      index = userlist.map(function(o) { return o.username; }).indexOf(username);
      if(index == -1) acc_valid = "valid";
      else acc_valid = "invalid";
    }

    index = robotver[0].indexOf(socket.id);
    if(password != "" && emailaddr != "" && robot == robotver[1][index])
    {
      for(i in userlist)
        if(userlist[i].socket != null)
          userlist[i].socket.emit("refresh online user", "add", { "username": username,
                                                                  "newmsg"  : false,
                                                                  "msg"     : null,
                                                                  "time"    : null,
                                                                  "online"  : false });
      userlist.push({ "username"     : username,
                      "password"     : password,
                      "email"        : emailaddr,
                      "key"          : null,
                      "socket"       : null,
                      "privateGroups": [],
                      "publicGroups" : [],
                      "currentGroup" : {"type": "none", "groupid": "none"} });
      console.log("new user: " + [username, password, emailaddr]);
      fs.appendFile("data/userlog", username + "\t" + password + "\t" + emailaddr + "\n" ,"utf8", function (err) {
        if(err) console.log(err);
      });
    }
    socket.emit("reg", acc_valid, password != "", emailaddr != "", robot != robotver[1][index]);
  });

  socket.on("private on", function(username, noreturn) {
    var index = userlist.map(function(o) { return o.socket; }).indexOf(socket);
    var index2 = userlist.map(function(o) { return o.username; }).indexOf(username);
    if(index == -1 || index2 == -1 || userlist[index].socket != socket) socket.emit("login verify", "invalid");
    else
    {
      var groupindex = userlist[index].privateGroups.map(function(o) { return o.username; }).indexOf(username);
      if(groupindex == -1)
      {
        fs.appendFile("data/private/privategroups", userlist[index].username + "\t" + username + "\n", "utf8", function (err) {
          if(err) console.log(err);
        });

        console.assert(!fs.existsSync("data/private/" + maxPrivateGroupId) , maxPrivateGroupId + " exists!");
        fs.appendFile("data/private/" + maxPrivateGroupId, "", "utf8", function (err) {
          if(err) console.log(err);
        });

        console.assert(!fs.existsSync("data/private/read/" + maxPrivateGroupId) , maxPrivateGroupId + " exists!");
        fs.writeFile("data/private/read/" + maxPrivateGroupId, "0\n0\n", "utf8", function (err) {
          if(err) console.log(err);
        });

        userlist[index].privateGroups.push({ "username": username, "groupid": maxPrivateGroupId.toString() });
        userlist[index2].privateGroups.push({ "username": userlist[index].username, "groupid": maxPrivateGroupId.toString() });
        privateGroupList.push({ "groupid": maxPrivateGroupId.toString(),
                                "user"   : [{ "username": username, "start" : 0 },
                                            { "username": userlist[index].username, "start": 0 }],
                                "chatlog": [] });
        userlist[index].currentGroup = { "type": "private", "groupid": maxPrivateGroupId.toString() };
        ++maxPrivateGroupId;
      }
      else
      {
        var groupid = userlist[index].privateGroups[groupindex].groupid;
        groupindex = privateGroupList.map(function(o) { return o.groupid; }).indexOf(groupid);
        var start = null;
        for(i in privateGroupList[groupindex].user)
          if(privateGroupList[groupindex].user[i].username == username)
             start = privateGroupList[groupindex].user[i].start;
          else {
            if(userlist[index2].socket != null)
              userlist[index2].socket.emit("private update", userlist[index].username, privateGroupList[groupindex].user[i].start, privateGroupList[groupindex].chatlog.length);
              privateGroupList[groupindex].user[i].start = privateGroupList[groupindex].chatlog.length;
          }
        fs.writeFile("data/private/read/" + groupid, privateGroupList[groupindex].user[0].start + "\n" +
                                                       privateGroupList[groupindex].user[1].start + "\n", "utf8", function (err) {
          if(err) console.log(err);
        });
        if(noreturn != "noreturn") socket.emit("private on", privateGroupList[groupindex].chatlog, start);
        userlist[index].currentGroup = { "type": "private", "groupid": groupid };
      }
    }
  });

  socket.on("private chat message", function(username, msg){
    var index = userlist.map(function(o) { return o.socket; }).indexOf(socket);
    var index2 = userlist.map(function(o) { return o.username; }).indexOf(username);
    if(index == -1 || index2 == -1 || userlist[index].socket != socket) socket.emit("login verify", "invalid");
    else
    {
      var groupindex = userlist[index].privateGroups.map(function(o) { return o.username; }).indexOf(username);
      var groupid = userlist[index].privateGroups[groupindex].groupid;
      groupindex = privateGroupList.map(function(o) { return o.groupid; }).indexOf(groupid);
      var time = new Date();
      var newchat = {"username": userlist[index].username,
                     "msg"     : msg,
                     "time"    : time };
      privateGroupList[groupindex].chatlog.push(newchat);
      
      fs.appendFile("data/private/" + groupid, userlist[index].username + "\t" + msg + "\t" + time + "\v", "utf8", function (err) {
          if(err) console.log(err);
        });

      socket.emit("private add", username, newchat, userlist[index2].currentGroup.type == "private" && userlist[index2].currentGroup.groupid == groupid);
      socket.emit("refresh online user", "chat", { "username": username,
                                                   "msg"     : msg,
                                                   "time"    : time,
                                                   "isread"  : true });
      if(userlist[index2].socket != null) {
        userlist[index2].socket.emit("private add", userlist[index].username, newchat, false);
        userlist[index2].socket.emit("refresh online user", "chat", { "username": userlist[index].username,
                                                                      "msg"     : msg,
                                                                      "time"    : time,
                                                                      "isread"  : userlist[index2].currentGroup.type == "private" && userlist[index2].currentGroup.groupid == groupid });
      }

      for(i in privateGroupList[groupindex].user)
        if(privateGroupList[groupindex].user[i].username != username)
          privateGroupList[groupindex].user[i].start = privateGroupList[groupindex].chatlog.length;
        else if(userlist[index2].currentGroup.type == "private" && userlist[index2].currentGroup.groupid == groupid )
          privateGroupList[groupindex].user[i].start = privateGroupList[groupindex].chatlog.length;

      fs.writeFile("data/private/read/" + groupid, privateGroupList[groupindex].user[0].start + "\n" +
                                                   privateGroupList[groupindex].user[1].start + "\n", "utf8", function (err) {
        if(err) console.log(err);
      });
          
    }
  });

  socket.on("disconnect", function() {
    var index = userlist.map(function(o) { return o.socket; }).indexOf(socket);
    if(index != -1)
    {
      userlist[index].socket = null;
      userlist[index].currentGroup.type = "none";
      console.log("user " + userlist[index].username + " left");
      
      for(i in userlist)
        if(userlist[i].socket != null)
          userlist[i].socket.emit("refresh online user", "online", { "username": userlist[index].username, "state": false });
    }

    console.log("Client gone (id=" + socket.id + ").");

    index = robotver[0].indexOf(socket.id);
    if(index != -1) {
      robotver[0].splice(index, 1);
      robotver[1].splice(index, 1);
      console.log(robotver);
    }
  });
});
