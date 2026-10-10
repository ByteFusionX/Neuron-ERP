const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.resolve(__dirname, '..', 'uploads'); 
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Browsers send UTF-8 names but multer reads them as latin1 ("é" arrives as "Ã©"); decode once so every module stores the real name.
        const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
        if (!decoded.includes('�')) file.originalname = decoded;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

module.exports = upload;
