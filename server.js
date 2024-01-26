const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const fs = require('fs');

const app = express();
const port = 4000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'key12345',
    resave: false,
    saveUninitialized: true
}));

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456789.root',
    database: 'noelDB',
});


  app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// ... (previous code)

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const sql = 'SELECT * FROM login WHERE username = ? AND password = ? AND isadmin < 3';

    connection.query(sql, [username, password], (error, results) => {
        if (error) {
            console.error('Error executing SQL query:', error);
            res.status(500).json({ error: 'Internal Server Error', message: error.message });
        } else {
            if (results.length > 0) {
                const loginID = results[0].loginID;
                const isAdmin = results[0].isadmin === 1;

                getUserIdFromLoginID(loginID, (err, userID) => {
                    if (err) {
                        res.status(500).json({ error: 'Internal Server Error', message: err.message });
                    } else {
                        req.session.user = {
                            username: results[0].username,
                            loginID: loginID,
                            userID: userID,
                            isAdmin: isAdmin,
                        };

                        res.json({ success: true });
                    }
                });
            } else {
                // Failed login
                res.json({ success: false, message: 'Invalid credentials' });
            }
        }
    });
});

app.get('/userGrades', (req, res) => {
    const user = req.session.user;

    if (!user) {
        res.redirect('/login');
    } else if (user.isAdmin) {
        // If the user is an admin, redirect them to the admin page
        res.redirect('/admin');
    } else {
        // If the user is not an admin, proceed with the grades page logic
        const sql = 'SELECT j.job, u.name, u.surname, u.place, u.birthday, l.lesson, g.grade, g.date FROM user u JOIN grades g ON u.userID = g.userID JOIN jobs j ON u.jobID = j.jobID JOIN lesson l ON l.lessonID = g.lessonID WHERE u.loginID = ? ORDER BY u.jobID, u.userID, g.date;';

        connection.query(sql, [user.loginID], (error, results) => {
            if (error) {
                console.error('Error executing SQL query:', error);
                res.status(500).json({ error: 'Internal Server Error', message: error.message });
            } else {

                // Read the HTML template
                const htmlTemplate = fs.readFileSync(path.join(__dirname, 'userGrades.html'), 'utf-8');

                // Convert the data to a JSON string
                const jsonData = JSON.stringify({ user: { ...user, ...results[0] }, grades: results });

                // Inject the JSON data into the HTML template
                const updatedHtml = htmlTemplate.replace('<!-- DATA_PLACEHOLDER -->', `<script>const data = ${jsonData};</script>`);

                // Send the modified HTML
                res.send(updatedHtml);
            }
        });
    }
});
app.get('/admin', (req, res) => {
    const user = req.session.user;

    if (!user) {
        res.redirect('/login');
    } else if (!user.isAdmin) {
        // If the user is not an admin, redirect them to the userGrades page
        res.redirect('/userGrades');
    } else {
        const sql = 'SELECT j.job, u.name, u.surname, u.place, u.birthday, l.lesson, g.grade, g.date, g.gradeID FROM user u JOIN grades g ON u.userID = g.userID JOIN jobs j ON u.jobID = j.jobID JOIN lesson l ON l.lessonID = g.lessonID ORDER BY u.jobID, u.userID, g.date;';

        connection.query(sql, (error, results) => {
            if (error) {
                console.error('Error executing SQL query:', error);
                res.status(500).json({ error: 'Internal Server Error', message: error.message });
            } else {
                // Read the HTML template
                const htmlTemplate = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');

                // Convert the data to a JSON string
                const jsonData = JSON.stringify({ admin: { ...user }, grades: results });

                // Inject the JSON data into the HTML template
                const updatedHtml = htmlTemplate.replace('<!-- DATA_PLACEHOLDER -->', `<script>const data = ${jsonData};</script>`);

                // Send the modified HTML
                res.send(updatedHtml);
            }
        });
    }
});

app.post('/deleteGrade', (req, res) => {
    const { gradeID } = req.body;

    // Implement the logic to delete the grade with the given gradeID
    const deleteSql = 'DELETE FROM grades WHERE gradeID = ?';

    connection.query(deleteSql, [gradeID], (error, results) => {
        if (error) {
            console.error('Error executing SQL query:', error);
            res.status(500).json({ success: false, message: error.message });
        } else {
            res.json({ success: true, message: 'Grade deleted successfully' });
        }
    });
});
app.get('/admin/edit', (req, res) => {
    const user = req.session.user;

    if (!user || !user.isAdmin) {
        res.redirect('/login');
    } else {
        // Retrieve the gradeID from the query parameters
        const gradeID = req.query.gradeID;

        // Fetch the grade details for editing
        const sql = 'SELECT user.name, user.surname, lesson.lesson, grades.grade, grades.gradeID FROM user JOIN grades ON user.userID = grades.userID JOIN lesson ON grades.lessonID = lesson.lessonID WHERE grades.gradeID = ?;';

        connection.query(sql, [gradeID], (error, results) => {
            if (error) {
                console.error('Error executing SQL query:', error);
                res.status(500).json({ error: 'Internal Server Error', message: error.message });
            } else {
                if (results.length > 0) {
                    const gradeDetails = results[0];

                    // Read the HTML template for the edit page
                    const htmlTemplate = fs.readFileSync(path.join(__dirname, 'editGrade.html'), 'utf-8');

                    // Convert the data to a JSON string
                    const jsonData = JSON.stringify({ user, gradeDetails });

                    // Inject the JSON data into the HTML template
                    const updatedHtml = htmlTemplate.replace('<!-- DATA_PLACEHOLDER -->', `<script>const data = ${jsonData};</script>`);

                    // Send the modified HTML
                    res.send(updatedHtml);
                } else {
                    // Grade not found
                    res.status(404).json({ error: 'Not Found', message: 'Grade not found' });
                }
            }
        });
    }
});


// Add a new route for handling grade updates
app.post('/admin/edit', (req, res) => {
    const user = req.session.user;

    if (!user || !user.isAdmin) {
        res.redirect('/login');
    } else {
        const { gradeID, grade } = req.body;

        // Update the grade and date
        const updateSql = 'UPDATE grades SET grade = ?, date = CURRENT_TIMESTAMP WHERE gradeID = ?;';

        connection.query(updateSql, [grade, gradeID], (error, results) => {
            if (error) {
                console.error('Error executing SQL query:', error);
                res.status(500).json({ error: 'Internal Server Error', message: error.message });
            } else {
                res.json({ success: true });
            }
        });
    }
});
// ... (previous code)

// Add a new route for the newGrade page
app.get('/admin/newGrade', (req, res) => {
    const user = req.session.user;

    if (!user || !user.isAdmin) {
        res.redirect('/login');
    } else {
        // Fetch students and lessons from the database
        const getStudentsSql = 'SELECT userID, name, surname FROM user;';
        const getLessonsSql = 'SELECT lessonID, lesson FROM lesson;';

        // Use Promise.all to fetch both student and lesson data concurrently
        Promise.all([
            queryPromise(getStudentsSql),
            queryPromise(getLessonsSql),
        ])
        .then(([students, lessons]) => {
            // Read the HTML template for the newGrade page
            const htmlTemplate = fs.readFileSync(path.join(__dirname, 'newGrade.html'), 'utf-8');

            // Convert the data to a JSON string
            const jsonData = JSON.stringify({ students, lessons });

            // Inject the JSON data into the HTML template
            const updatedHtml = htmlTemplate.replace('<!-- DATA_PLACEHOLDER -->', `<script>const data = ${jsonData};</script>`);

            // Send the modified HTML
            res.send(updatedHtml);
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            res.status(500).json({ error: 'Internal Server Error', message: error.message });
        });
    }
});

// Helper function to execute a SQL query and return a promise
function queryPromise(sql) {
    return new Promise((resolve, reject) => {
        connection.query(sql, (error, results) => {
            if (error) {
                console.error('Error executing SQL query:', error);
                reject(error);
            } else {
                resolve(results);
            }
        });
    });
}

// ... (remaining code)

// Add a new route for handling grade submission
app.post('/admin/submitGrade', (req, res) => {
    const user = req.session.user;

    if (!user || !user.isAdmin) {
        res.redirect('/login');
    } else {
        const { studentID, lessonID, grade } = req.body;

        // Implement the logic to insert the new grade into the database
        const insertGradeSql = 'INSERT INTO grades (userID, lessonID, grade, date) VALUES (?, ?, ?, CURRENT_TIMESTAMP);';

        connection.query(insertGradeSql, [studentID, lessonID, grade], (error, results) => {
            if (error) {
                console.error('Error executing SQL query:', error);
                res.json({ success: false, message: error.message });
            } else {
                res.json({ success: true });
            }
        });
    }
});


// Your function to get userID based on loginID
function getUserIdFromLoginID(loginID, callback) {
    const sql = 'SELECT userID FROM user WHERE loginID = ?';

    connection.query(sql, [loginID], (error, results) => {
        if (error) {
            console.error('Error executing SQL query:', error);
            callback(error, null);
        } else {
            if (results.length > 0) {
                const userID = results[0].user_id;
                callback(null, userID);
            } else {
                // No user found for the given loginID
                callback(null, null);
            }
        }
    });
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});