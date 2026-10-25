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

// Keep in sync with client/src/app/shared/constants/upload-types.ts. Images also cover product/logo uploads (webp).
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.webp', '.csv', '.tsv', '.txt'];

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (ALLOWED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
        cb(new Error(`File type not allowed: ${file.originalname}`));
    }
});

module.exports = upload;
