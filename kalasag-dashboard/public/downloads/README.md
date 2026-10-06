# Mobile APK Downloads

Due to GitHub repository file size limits (maximum 100 MB), precompiled binary `.apk` files are excluded from version control.

### Adding the Resident App APK:
1. Build the mobile app using EAS Build or local Gradle build:
   ```bash
   cd kalasag-mobile
   eas build --platform android --profile production --local
   ```
2. Place the resulting `kalasag-resident.apk` file into this directory (`kalasag-dashboard/public/downloads/kalasag-resident.apk`).
3. When deployed to Firebase Hosting or your web server, the web portal will serve the APK directly via `/downloads/kalasag-resident.apk`.
4. Alternatively, host the APK on GitHub Releases, Firebase Storage, or Cloudinary and update the download link in `kalasag-dashboard/src/app/login/page.js`.
