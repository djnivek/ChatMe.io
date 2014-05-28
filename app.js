var app = require('express')(),
        express = require('express'),
        server = require('http').createServer(app),
        io = require('socket.io').listen(server),
        fs = require('fs'),
        mysql = require('mysql');

var conn_conf = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '95368192',
    database: 'chatme_io'
};

var conn_mysql = mysql.createConnection(conn_conf);
conn_mysql.connect(function(err) {
    if (err)
        console.log("Could not connect to DB");
    else {
        console.log("Connected to " + conn_conf.database + ' on ' + conn_conf.host);
    }
});

// Authenticator
app.use(express.basicAuth(function(user, pass) {
    return user === 'devuser' && pass === 'btssio';
}));

app.get('/', function(req, res) {
    console.log("/ called");
    res.sendfile(__dirname + '/connexion.html');
});

app.get('/php/log', function(req, res) {
    console.log("/php/log called");
    res.sendfile(__dirname + '/private/log/login.php');
});

app.get('/inscription', function(req, res) {
    console.log("/inscription called");
    res.sendfile(__dirname + '/connexion.html');
});

app.get('/connexion', function(req, res) {
    console.log("/connexion called");
    res.sendfile(__dirname + '/connexion.html');
});

app.get('/chat-:token', function(req, res) {
    console.log("/chat called");
    conn_mysql.query('SELECT login FROM user WHERE tmp_token = "' + req.params.token + '"', function(err, rows) {
        console.log('SELECT login FROM user WHERE tmp_token = "' + req.params.token + '"');

        if (rows[0]) {
            console.log("Access allowed " + rows[0]['login']);
            res.render('chatroom.ejs', {login: rows[0]['login'], token: req.params.token});
        }
        else {
            console.log("Access denied");
            res.sendfile(__dirname + '/connexion.html');
        }
    });
});

app.get('/css/:file', function(req, res) {
    res.sendfile(__dirname + '/public/css/' + req.params.file);
});

// Quand un client se connecte, on le note dans la console
io.sockets.on('connection', function(socket) {

    //  L'utilisateur à besoin des anciens messages
    socket.on('needOldMessage', function() {
        send_old_message(7, socket);
    });

    //  L'utilisateur à besoin des anciens messages
    socket.on('newaccount', function(username, password, email) {
        conn_mysql.query("INSERT INTO `chatme_io`.`user` (`login`, `password`, `mail`, `tmp_token`) VALUES ('" + username + "', '" + password + "', '" + email + "', '" + makeid(18) + "');", function(err, rowsIns) {
            console.log("INSERT INTO `chatme_io`.`user` (`login`, `password`, `mail`, `tmp_token`) VALUES ('" + username + "', '" + password + "', '" + email + "', '" + makeid(18) + "');");
            socket.emit('newaccount_return', (rowsIns.length !== 0));
        });
    });

    //  Reception d'un message par un utilisateur
    socket.on('message', function(message) {
        socket.get('iduser', function(error, iduser) {
            conn_mysql.query("INSERT INTO `chatme_io`.`message` (`iduser`, `message`, `date`) VALUES ('" + iduser + "', '" + addslashes(message) + "', CURRENT_TIMESTAMP);", function(err, rowsIns) {
                console.log("INSERT INTO `chatme_io`.`message` (`iduser`, `message`, `date`) VALUES ('" + iduser + "', '" + message + "', CURRENT_TIMESTAMP);");
                conn_mysql.query('SELECT `date` FROM `message` WHERE idmessage = ' + rowsIns.insertId, function(err, rowsSel) {
                    console.log('SELECT `date` FROM `message` WHERE idmessage = ' + rowsIns.insertId);
                    if (rowsSel.length) {
                        socket.get('pseudo', function(error, pseudo) {
                            var objmsg = {};
                            objmsg.pseudo = pseudo;
                            objmsg.text = message;
                            objmsg.date = rowsSel[0]['date'];
                            var json_objmsg = JSON.stringify(objmsg);
                            console.log(json_objmsg);
                            socket.emit('message', json_objmsg);
                            socket.broadcast.emit('message', json_objmsg);
                        });
                    }
                });
            });
        });
    });

    //  Reception du formulaire de login
    socket.on('login', function(login, password) {
        conn_mysql.query('SELECT login FROM user WHERE login = "' + login + '" AND password = "' + password + '"', function(err, rows) {
            console.log('SELECT login FROM user WHERE login = "' + login + '" AND password = "' + password + '"');
            if (rows.length) {
                var token = "";
                var logged = (rows[0]['login'] === login); //  Le mot de passe est-il bon ?
                if (logged) {
                    token = makeid(18); //  Création d'un nouveau token
                    conn_mysql.query('UPDATE user SET tmp_token = "' + token + '" WHERE login = "' + rows[0]['login'] + '"', function(err, rows) {
                        console.log('UPDATE user SET tmp_token = "' + token + '"');
                    });
                }
            }
            socket.emit('login_return', logged, login, token);
        });
    });

    socket.on('userconnection', function(token) {
        conn_mysql.query('SELECT login, iduser FROM user WHERE tmp_token = "' + token + '"', function(err, rows) {
            console.log('SELECT login, iduser FROM user WHERE tmp_token = "' + token + '"');
            if (rows[0]) {
                console.log("Access allowed for " + rows[0]['login']);
                socket.set("pseudo", rows[0]['login']);
                socket.set("iduser", rows[0]['iduser']);
                socket.emit('accept_connection', true, rows[0]['login']);
                socket.broadcast.emit('user_join_us', rows[0]['login'], new Date());
            }
            else {
                console.log("Access denied");
                socket.emit('accept_connection', false);
            }
        });
    });
});
server.listen(8080);

function makeid(length)
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

function addslashes(str) {
    str = str.replace("\'", "\\\'");
    str = str.replace("\"", "\\\"");
    return str;
}

function send_old_message(nb_message, _socket) {
    var messages = {};
    conn_mysql.query('SELECT user.login, msg.message, msg.date FROM message msg INNER JOIN user using (iduser) GROUP BY idmessage DESC limit ' + nb_message, function(err, rows) {
        console.log('SELECT user.pseudo, msg.message, msg.date FROM message msg INNER JOIN user using (iduser) GROUP BY idmessage DESC limit ' + nb_message);
        for (var i = 0; i < rows.length; i++) {
            eval('messages.message' + (i + 1) + ' = {};'); // variable dynamique
            eval('messages.message' + (i + 1) + '.pseudo  = rows[i][\'login\'];');
            eval('messages.message' + (i + 1) + '.text    = rows[i][\'message\'];');
            eval('messages.message' + (i + 1) + '.date    = rows[i][\'date\'];');
        }
        _socket.emit('json_old_message', JSON.stringify(messages));
    });
}