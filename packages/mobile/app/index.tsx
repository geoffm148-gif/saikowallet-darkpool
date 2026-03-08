import { Redirect } from 'expo-router';

export default function Index() {
  // For marketing screenshots, go straight to dashboard.
  // In production, this would check wallet state and redirect to onboarding or unlock.
  return <Redirect href="/(tabs)/dashboard" />;
}
