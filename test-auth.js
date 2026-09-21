require('dotenv').config();
const { google } = require('googleapis');
const credentials = require('./google-credentials.json');

const adminEmail = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || 'barbara@htu.edu.gh';

const auth = new google.auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
  subject: adminEmail,
});

const directory = google.admin({ version: 'directory_v1', auth });

async function check() {
  try {
    console.log('Authenticating service account...');
    console.log(`Impersonating admin: ${adminEmail}`);
    const token = await auth.authorize();
    console.log('Success! Service account exists and authenticated successfully.');
    
    console.log('Testing domain-wide delegation...');
    const res = await directory.users.list({ domain: 'htu.edu.gh', maxResults: 1 });
    console.log('Success! Can read the directory. Domain-wide delegation is perfectly configured!');
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('unauthorized_client')) {
        console.error('Domain-Wide Delegation has not propagated yet, or the Client ID/Scope is incorrect.');
    }
  }
}

check();
