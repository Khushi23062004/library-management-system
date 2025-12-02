const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();

// --- 1. SETTINGS ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// --- 2. DATABASE CONNECTION (UPDATED FOR DEPLOYMENT!) ---
// Production mein credentials environment variables (process.env) se aate hain.
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', // Localhost default (agar DB_HOST set nahi hai)
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'library_system',
    port: process.env.DB_PORT || 3306, // Default MySQL port
    multipleStatements: true 
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed: ' + err.stack);
        return;
    }
    console.log('✅ Success! Connected to MySQL Database (library_system).');
});

// --- 3. ROUTES ---

// ==========================
//      A. DASHBOARD (HOME)
// ==========================
app.get('/', (req, res) => {
    const sql = `
        SELECT COUNT(*) as count FROM Books;
        SELECT COUNT(*) as count FROM Members;
        SELECT COUNT(*) as count FROM Transactions WHERE ReturnDate IS NULL;
        SELECT IFNULL(SUM(FineAmount), 0) as total FROM Fines WHERE Status = 'Unpaid';
        
        SELECT 
            Transactions.TransactionID, 
            Members.MemberName, 
            Books.Title, 
            Transactions.IssueDate, 
            Transactions.ReturnDate 
        FROM Transactions
        JOIN Members ON Transactions.MemberID = Members.MemberID
        JOIN BookCopies ON Transactions.CopyID = BookCopies.CopyID
        JOIN Books ON BookCopies.BookID = Books.BookID
        ORDER BY Transactions.TransactionID DESC LIMIT 5;
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Dashboard Error:", err);
            return res.send("Error loading dashboard data.");
        }

        const stats = {
            books: results[0][0].count,
            members: results[1][0].count,
            activeLoans: results[2][0].count,
            pendingFines: results[3][0].total
        };

        const recentTxns = results[4];
        res.render('index', { counts: stats, recentTransactions: recentTxns });
    });
});

// ==========================
//      B. BOOKS MANAGEMENT
// ==========================
app.get('/books', (req, res) => {
    const sql = `
        SELECT Books.BookID, Books.Title, Books.ISBN, Books.PublicationDate,
        Publishers.PublisherName, Categories.CategoryName,
        GROUP_CONCAT(DISTINCT Authors.AuthorName SEPARATOR ', ') AS Authors,
        COUNT(BookCopies.CopyID) as TotalCopies
        FROM Books
        LEFT JOIN Publishers ON Books.PublisherID = Publishers.PublisherID
        LEFT JOIN Categories ON Books.CategoryID = Categories.CategoryID
        LEFT JOIN BookAuthors ON Books.BookID = BookAuthors.BookID
        LEFT JOIN Authors ON BookAuthors.AuthorID = Authors.AuthorID
        LEFT JOIN BookCopies ON Books.BookID = BookCopies.BookID
        GROUP BY Books.BookID`;

    db.query(sql, (err, results) => {
        if (err) return res.send("Error fetching books");
        res.render('books', { books: results });
    });
});

app.get('/add-book', (req, res) => res.render('add-book'));

app.post('/add-book', (req, res) => {
    const { title, isbn, pubDate, category, publisher, author, shelfLocation } = req.body;
    
    // Publisher -> Category -> Book -> Author -> Link -> Copy
    const pubSql = "INSERT IGNORE INTO Publishers (PublisherName) VALUES (?)";
    db.query(pubSql, [publisher], (err) => {
        if (err) throw err;
        db.query("SELECT PublisherID FROM Publishers WHERE PublisherName = ?", [publisher], (err, pubRes) => {
            const pubId = pubRes[0].PublisherID;
            const catSql = "INSERT IGNORE INTO Categories (CategoryName) VALUES (?)";
            db.query(catSql, [category], (err) => {
                if (err) throw err;
                db.query("SELECT CategoryID FROM Categories WHERE CategoryName = ?", [category], (err, catRes) => {
                    const catId = catRes[0].CategoryID;
                    const bookSql = "INSERT INTO Books (Title, ISBN, PublicationDate, CategoryID, PublisherID) VALUES (?, ?, ?, ?, ?)";
                    db.query(bookSql, [title, isbn, pubDate, catId, pubId], (err, bookRes) => {
                        if (err) return res.send("Error: Duplicate ISBN or Invalid Data.");
                        const bookId = bookRes.insertId;
                        const authSql = "INSERT IGNORE INTO Authors (AuthorName) VALUES (?)";
                        db.query(authSql, [author], (err) => {
                            if (err) throw err;
                            db.query("SELECT AuthorID FROM Authors WHERE AuthorName = ?", [author], (err, authRes) => {
                                const authId = authRes[0].AuthorID;
                                const linkSql = "INSERT INTO BookAuthors (BookID, AuthorID) VALUES (?, ?)";
                                db.query(linkSql, [bookId, authId], (err) => {
                                    if (err) throw err;
                                    const copySql = "INSERT INTO BookCopies (BookID, Status, PurchaseDate, ShelfLocation) VALUES (?, 'Available', CURDATE(), ?)";
                                    db.query(copySql, [bookId, shelfLocation || 'General Shelf'], (err) => {
                                        if (err) throw err;
                                        res.redirect('/books');
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get('/edit-book/:id', (req, res) => {
    const bookId = req.params.id;
    const sql = `SELECT Books.BookID, Books.Title, Books.ISBN, Books.PublicationDate, Publishers.PublisherName, Categories.CategoryName FROM Books LEFT JOIN Publishers ON Books.PublisherID = Publishers.PublisherID LEFT JOIN Categories ON Books.CategoryID = Categories.CategoryID WHERE Books.BookID = ?`;
    db.query(sql, [bookId], (err, result) => {
        if (err) throw err;
        if (result.length === 0) return res.send("Book not found");
        let book = result[0];
        if (book.PublicationDate) book.PublicationDate = new Date(book.PublicationDate).toISOString().split('T')[0];
        res.render('edit-book', { book: book });
    });
});

app.post('/edit-book/:id', (req, res) => {
    const { title, isbn, pubDate } = req.body;
    db.query("UPDATE Books SET Title=?, ISBN=?, PublicationDate=? WHERE BookID=?", [title, isbn, pubDate, req.params.id], (err) => {
        if (err) return res.send("Error");
        res.redirect('/books');
    });
});

app.get('/delete-book/:id', (req, res) => {
    db.query("DELETE FROM Books WHERE BookID = ?", [req.params.id], (err) => {
        if (err) return res.send("Error");
        res.redirect('/books');
    });
});

// ==========================
//   C. MANAGE COPIES
// ==========================
app.get('/manage-copies/:bookId', (req, res) => {
    const bookId = req.params.bookId;
    const bookSql = "SELECT Title FROM Books WHERE BookID = ?";
    db.query(bookSql, [bookId], (err, bookResult) => {
        if (err) throw err;
        if (bookResult.length === 0) return res.send("Book not found");
        
        const copySql = "SELECT * FROM BookCopies WHERE BookID = ?";
        db.query(copySql, [bookId], (err, copies) => {
            if (err) throw err;
            res.render('manage-copies', { book: bookResult[0], copies: copies, bookId: bookId });
        });
    });
});

app.post('/add-copy/:bookId', (req, res) => {
    const bookId = req.params.bookId;
    const { shelfLocation } = req.body;
    const sql = "INSERT INTO BookCopies (BookID, Status, PurchaseDate, ShelfLocation) VALUES (?, 'Available', CURDATE(), ?)";
    db.query(sql, [bookId, shelfLocation], (err) => {
        if (err) return res.send("Error adding copy");
        res.redirect('/manage-copies/' + bookId);
    });
});

app.get('/delete-copy/:copyId', (req, res) => {
    const getBookIdSql = "SELECT BookID FROM BookCopies WHERE CopyID = ?";
    db.query(getBookIdSql, [req.params.copyId], (err, result) => {
        if(err || result.length === 0) return res.send("Copy not found");
        const bookId = result[0].BookID;
        db.query("DELETE FROM BookCopies WHERE CopyID = ?", [req.params.copyId], (err) => {
            if (err) return res.send("Error deleting copy (Maybe it is issued?)");
            res.redirect('/manage-copies/' + bookId);
        });
    });
});


// ==========================
//      D. MEMBERS MANAGEMENT
// ==========================
app.get('/members', (req, res) => {
    db.query("SELECT * FROM Members", (err, results) => {
        if (err) return res.send("Error");
        res.render('members', { members: results });
    });
});

app.get('/add-member', (req, res) => res.render('add-member'));

app.post('/add-member', (req, res) => {
    const { name, email, phone, address, membershipType } = req.body;
    let expiryDate = null;
    const today = new Date();
    if (membershipType === 'Monthly') { today.setMonth(today.getMonth() + 1); expiryDate = today.toISOString().slice(0, 10); }
    else if (membershipType === 'Annual') { today.setFullYear(today.getFullYear() + 1); expiryDate = today.toISOString().slice(0, 10); }
    
    db.query("INSERT INTO Members (MemberName, Email, PhoneNumber, Address, JoinDate, MembershipType, MembershipExpiryDate) VALUES (?, ?, ?, ?, CURDATE(), ?, ?)", [name, email, phone, address, membershipType, expiryDate], (err) => {
        if (err) return res.send("Error: Email/Phone exists.");
        res.redirect('/members');
    });
});

app.get('/edit-member/:id', (req, res) => {
    db.query("SELECT * FROM Members WHERE MemberID = ?", [req.params.id], (err, result) => {
        if (err) throw err;
        res.render('edit-member', { member: result[0] });
    });
});

app.post('/edit-member/:id', (req, res) => {
    const { name, email, phone, address, membershipType } = req.body;
    db.query("UPDATE Members SET MemberName=?, Email=?, PhoneNumber=?, Address=?, MembershipType=? WHERE MemberID=?", [name, email, phone, address, membershipType, req.params.id], (err) => {
        if (err) return res.send("Error");
        res.redirect('/members');
    });
});

app.get('/delete-member/:id', (req, res) => {
    db.query("DELETE FROM Members WHERE MemberID = ?", [req.params.id], (err) => {
        if (err) return res.send("Error");
        res.redirect('/members');
    });
});

// ==========================
//      E. STAFF MANAGEMENT
// ==========================
app.get('/staff', (req, res) => {
    db.query("SELECT * FROM Staff", (err, results) => {
        if (err) return res.send("Error fetching staff");
        res.render('staff', { staffMembers: results });
    });
});

app.get('/add-staff', (req, res) => res.render('add-staff'));

app.post('/add-staff', (req, res) => {
    const { name, username, password, role } = req.body;
    const sql = "INSERT INTO Staff (StaffName, Username, PasswordHash, Role) VALUES (?, ?, ?, ?)";
    db.query(sql, [name, username, password, role], (err) => {
        if (err) return res.send("Error: Username likely exists");
        res.redirect('/staff');
    });
});

app.get('/delete-staff/:id', (req, res) => {
    db.query("DELETE FROM Staff WHERE StaffID = ?", [req.params.id], (err) => {
        if (err) return res.send("Error deleting staff");
        res.redirect('/staff');
    });
});


// ==========================
//   F. TRANSACTIONS
// ==========================
app.get('/transactions', (req, res) => {
    const sql = `
        SELECT 
            Transactions.TransactionID, 
            Transactions.IssueDate, 
            Transactions.DueDate, 
            Transactions.ReturnDate,
            Transactions.CopyID,
            Members.MemberName,
            Books.Title
        FROM Transactions
        JOIN Members ON Transactions.MemberID = Members.MemberID
        JOIN BookCopies ON Transactions.CopyID = BookCopies.CopyID
        JOIN Books ON BookCopies.BookID = Books.BookID
        ORDER BY Transactions.TransactionID DESC
    `;
    db.query(sql, (err, results) => {
        if (err) { console.error(err); return res.send("Error fetching transactions"); }
        res.render('transactions', { transactions: results });
    });
});

app.get('/issue-book', (req, res) => {
    db.query("SELECT MemberID, MemberName FROM Members", (err, members) => {
        if (err) throw err;
        const bookSql = `
            SELECT BookCopies.CopyID, Books.Title, BookCopies.ShelfLocation
            FROM BookCopies 
            JOIN Books ON BookCopies.BookID = Books.BookID 
            WHERE BookCopies.Status = 'Available'
        `;
        db.query(bookSql, (err, books) => {
            if (err) throw err;
            res.render('issue-book', { members: members, books: books });
        });
    });
});

app.post('/issue-book', (req, res) => {
    const { memberId, copyId, dueDate } = req.body;
    // Default StaffID 1 for now
    const sql = "INSERT INTO Transactions (CopyID, MemberID, StaffID, IssueDate, DueDate) VALUES (?, ?, 1, CURDATE(), ?)";
    db.query(sql, [copyId, memberId, dueDate], (err, result) => {
        if (err) { console.error(err); return res.send("Error issuing book"); }
        db.query("UPDATE BookCopies SET Status = 'On Loan' WHERE CopyID = ?", [copyId], (err) => {
            if (err) throw err;
            res.redirect('/transactions');
        });
    });
});

app.get('/return-book/:id', (req, res) => {
    const transId = req.params.id;
    db.query("SELECT CopyID, DueDate FROM Transactions WHERE TransactionID = ?", [transId], (err, result) => {
        if (err) throw err;
        const copyId = result[0].CopyID;
        const dueDate = new Date(result[0].DueDate);
        
        db.query("UPDATE Transactions SET ReturnDate = CURDATE() WHERE TransactionID = ?", [transId], (err) => {
            if (err) throw err;
            db.query("UPDATE BookCopies SET Status = 'Available' WHERE CopyID = ?", [copyId], (err) => {
                if (err) throw err;
                
                // Fine Calculation Logic
                const today = new Date();
                if (today > dueDate) {
                    const diffTime = Math.abs(today - dueDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    const fineAmount = diffDays * 5; // ₹5 per day
                    
                    db.query("INSERT INTO Fines (TransactionID, FineAmount, FineDate, Status) VALUES (?, ?, CURDATE(), 'Unpaid')", 
                        [transId, fineAmount], (err) => {
                            if (err) console.error("Fine Error", err);
                            res.redirect('/transactions');
                        });
                } else {
                    res.redirect('/transactions');
                }
            });
        });
    });
});

// ==========================
//      G. FINES MANAGEMENT
// ==========================
app.get('/fines', (req, res) => {
    const sql = `
        SELECT 
            Fines.FineID, Fines.FineAmount, Fines.FineDate, Fines.Status,
            Members.MemberName,
            Books.Title
        FROM Fines
        JOIN Transactions ON Fines.TransactionID = Transactions.TransactionID
        JOIN Members ON Transactions.MemberID = Members.MemberID
        JOIN BookCopies ON Transactions.CopyID = BookCopies.CopyID
        JOIN Books ON BookCopies.BookID = Books.BookID
        ORDER BY Fines.FineID DESC
    `;
    db.query(sql, (err, results) => {
        if (err) { console.error(err); return res.send("Error fetching fines"); }
        res.render('fines', { fines: results });
    });
});

app.get('/pay-fine/:id', (req, res) => {
    const fineId = req.params.id;
    db.query("UPDATE Fines SET Status = 'Paid' WHERE FineID = ?", [fineId], (err) => {
        if (err) return res.send("Error paying fine");
        res.redirect('/fines');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));