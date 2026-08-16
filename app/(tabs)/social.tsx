import { useIsFocused } from '@react-navigation/native';
import { lazy, Suspense, useRef } from 'react';

export default function SocialScreen() {
  const isFocused = useIsFocused();
  const hasBeenFocusedRef = useRef(isFocused);
  if (isFocused) hasBeenFocusedRef.current = true;
  if (!hasBeenFocusedRef.current) return null;
  return (
    <Suspense fallback={null}>
      <LazyFriendsScreen asTab />
    </Suspense>
  );
}

const LazyFriendsScreen = lazy(() => import('../friends'));
