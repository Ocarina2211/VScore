import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from './firebase';

const storage = getStorage(app);

export async function uploadAvatarAsync(uri: string, uid: string): Promise<string> {
  // Fonctionne sur Expo Go, bare et web : fetch(uri) -> blob
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `avatars/${uid}.jpg`);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
}
