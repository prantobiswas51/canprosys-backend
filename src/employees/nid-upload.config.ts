import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';

// Lives outside dist/ (project root, not __dirname) so it survives a
// rebuild -- `nest build` wipes and regenerates dist/ on every run, which
// would otherwise delete every uploaded NID image along with it.
export const NID_UPLOAD_DIR = join(process.cwd(), 'uploads', 'nid');

if (!existsSync(NID_UPLOAD_DIR)) {
  mkdirSync(NID_UPLOAD_DIR, { recursive: true });
}

// No @types/multer in this project (noImplicitAny is off, so the untyped
// `multer` import is fine) -- these callback params are implicitly `any`.
export const nidMulterOptions = {
  storage: diskStorage({
    destination: NID_UPLOAD_DIR,
    filename: (req, file, cb) => {
      const side = file.fieldname === 'nidBack' ? 'back' : 'front';
      const employeeId = req.params?.id ?? 'new';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `emp-${employeeId}-${side}-${unique}${extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new BadRequestException('Only image files are allowed for NID uploads'), false);
      return;
    }
    cb(null, true);
  },
  // Originals can come in much larger than the 1MB we actually want to keep
  // -- compressNidImageIfNeeded() (see nid-image-compress.ts) shrinks
  // anything over that limit after upload, so this ceiling just guards
  // against genuinely absurd files (not phone photos), not the normal case.
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per image, hard ceiling only
};
