import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, View, StyleSheet } from 'react-native';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { TabNavigator } from './src/navigation/TabNavigator';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { useStore } from './src/store/useStore';
import { colors } from './src/theme/colors';
import { fontAssets } from './src/theme/typography';
import { AUTO_INTERVAL_MS } from './src/utils/syncThrottle';

// Segura a splash até as fontes entrarem, senão a primeira tela pisca na fonte
// do sistema e reflui.
void SplashScreen.preventAutoHideAsync();

function AppRoot() {
  const onboarded = useStore(s => s.settings.onboarded);
  const flushTelemetry = useStore(s => s.flushTelemetry);
  const syncMatches = useStore(s => s.syncMatches);
  const checkSession = useStore(s => s.checkSession);
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  /**
   * Ao abrir e sempre que o app volta ao primeiro plano: esvazia a fila
   * anônima e sincroniza as partidas da conta. É quando a conexão costuma
   * estar de volta.
   *
   * A sincronização precisa estar AQUI, e não só ao salvar e ao entrar na
   * conta. Quem atualiza o app já logado nunca passa por nenhum dos dois: as
   * partidas ficam paradas no aparelho, e o servidor parece vazio sem que
   * ninguém tenha feito nada errado. Foi exatamente isso que aconteceu.
   *
   * Sem conta ou sem fila, os dois são no-op.
   */
  React.useEffect(() => {
    // A conferência de sessão vem antes: se ela acabou, a sincronização já
    // sabe por que falhou e a tela já tem o que dizer.
    const rodar = () => { void checkSession(); void flushTelemetry(); void syncMatches(); };
    rodar();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') rodar();
    });
    // E de meia em meia hora com o app aberto, para quem passa a tarde no
    // torneio sem fechar o app. O intervalo minimo de um minuto continua
    // valendo: se algo ja sincronizou agora, isto nao repete.
    const relogio = setInterval(rodar, AUTO_INTERVAL_MS);
    return () => { sub.remove(); clearInterval(relogio); };
  }, [flushTelemetry, syncMatches, checkSession]);

  // Falha ao carregar fonte não impede o app de abrir: o texto sai na fonte do
  // sistema, o que é feio mas utilizável.
  React.useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
    if (fontError) console.warn('[App] fontes não carregadas:', fontError);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  if (!onboarded) {
    return <OnboardingScreen />;
  }

  // O download do modelo (~350 MB) acontece sob demanda, dentro da aba Gravar.
  // Trancar o app inteiro atrás dele impedia até de usar o contador de vida.
  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* O app tem uma paleta só, clara. Sem declarar isto, o Android decide
            pelo tema do sistema e os ícones da barra saem brancos sobre fundo
            claro — invisíveis para quem usa o celular no modo escuro. */}
        <StatusBar style="dark" backgroundColor={colors.bg} />
        <View style={styles.root}>
          <AppRoot />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});

registerRootComponent(App);
