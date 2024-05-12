import { JWT, GoogleAuth } from "google-auth-library"
import serviceAccount from '../../service-account.json'

export const getAccessToken = async () => {
  const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const res = await client.getAccessToken()
  return res.token
}

export const getCredentials = async () => {
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    credentials: serviceAccount
  });
  return await auth.getCredentials()
}