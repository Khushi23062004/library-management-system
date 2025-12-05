SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS Fines;
DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS Reservations;
DROP TABLE IF EXISTS BookAuthors;
DROP TABLE IF EXISTS BookCopies;
DROP TABLE IF EXISTS Books;
DROP TABLE IF EXISTS Staff;
DROP TABLE IF EXISTS Members;
DROP TABLE IF EXISTS Authors;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Publishers;

CREATE TABLE Publishers (
    PublisherID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    PublisherName VARCHAR(255) NOT NULL UNIQUE,
    ContactInfo VARCHAR(255)
);

CREATE TABLE Categories (
    CategoryID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    CategoryName VARCHAR(255) NOT NULL UNIQUE,
    Description TEXT
);

CREATE TABLE Authors (
    AuthorID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    AuthorName VARCHAR(255) NOT NULL,
    Biography TEXT
);

CREATE TABLE Members (
    MemberID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    MemberName VARCHAR(255) NOT NULL,
    Email VARCHAR(255) NOT NULL UNIQUE,
    PhoneNumber VARCHAR(20) NOT NULL UNIQUE,
    Address TEXT,
    JoinDate DATE NOT NULL,
    MembershipType ENUM('Annual', 'Monthly', 'Free') DEFAULT 'Free',
    MembershipExpiryDate DATE
);

CREATE TABLE Staff (
    StaffID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    StaffName VARCHAR(255) NOT NULL,
    Username VARCHAR(50) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Role ENUM('Admin', 'Librarian') NOT NULL
);

CREATE TABLE Books (
    BookID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    Title VARCHAR(255) NOT NULL,
    ISBN VARCHAR(13) UNIQUE NOT NULL,
    PublicationDate DATE,
    CategoryID INT NOT NULL,
    PublisherID INT NOT NULL,
    FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID),
    FOREIGN KEY (PublisherID) REFERENCES Publishers(PublisherID)
);

CREATE TABLE BookCopies (
    CopyID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    BookID INT NOT NULL,
    Status ENUM('Available', 'On Loan', 'Damaged', 'Reserved') DEFAULT 'Available',
    PurchaseDate DATE,
    ShelfLocation VARCHAR(50),
    FOREIGN KEY (BookID) REFERENCES Books(BookID) ON DELETE CASCADE
);

CREATE TABLE BookAuthors (
    BookAuthorID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    BookID INT NOT NULL,
    AuthorID INT NOT NULL,
    FOREIGN KEY (BookID) REFERENCES Books(BookID) ON DELETE CASCADE,
    FOREIGN KEY (AuthorID) REFERENCES Authors(AuthorID) ON DELETE CASCADE,
    UNIQUE KEY unique_book_author (BookID, AuthorID)
);

CREATE TABLE Reservations (
    ReservationID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    BookID INT NOT NULL,
    MemberID INT NOT NULL,
    ReservationDate DATE NOT NULL,
    Status ENUM('Waiting', 'Fulfilled', 'Cancelled') DEFAULT 'Waiting',
    FOREIGN KEY (BookID) REFERENCES Books(BookID),
    FOREIGN KEY (MemberID) REFERENCES Members(MemberID)
);

CREATE TABLE Transactions (
    TransactionID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    CopyID INT NOT NULL,
    MemberID INT NOT NULL,
    StaffID INT NOT NULL,
    IssueDate DATE NOT NULL,
    DueDate DATE NOT NULL,
    ReturnDate DATE,
    FOREIGN KEY (CopyID) REFERENCES BookCopies(CopyID),
    FOREIGN KEY (MemberID) REFERENCES Members(MemberID),
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID)
);

CREATE TABLE Fines (
    FineID INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    TransactionID INT NOT NULL,
    FineAmount DECIMAL(10, 2) NOT NULL,
    FineDate DATE NOT NULL,
    Status ENUM('Paid', 'Unpaid') DEFAULT 'Unpaid',
    FOREIGN KEY (TransactionID) REFERENCES Transactions(TransactionID)
);

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO Staff (StaffName, Username, PasswordHash, Role) 
VALUES ('Main Admin', 'admin', 'pass123', 'Admin');