import { JWT } from "google-auth-library"
import serviceAccount from '../../service-account.json'

async function getAccessToken() {
  const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const res = await client.getAccessToken()
  return res.token
}


export { getAccessToken }
