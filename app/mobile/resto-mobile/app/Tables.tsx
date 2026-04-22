import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TablesRedirectScreen() {
  const params = useLocalSearchParams<{
    paymentSuccess?: string;
    orderUpdatedSuccess?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/(tabs)',
        params: {
          ...(params.paymentSuccess ? { paymentSuccess: params.paymentSuccess } : {}),
          ...(params.orderUpdatedSuccess ? { orderUpdatedSuccess: params.orderUpdatedSuccess } : {}),
        },
      }}
    />
  );
}