import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Saiko Wallet] Unhandled error:', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.heading}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            An unexpected error occurred. Your funds are safe — this is a display issue only.
          </Text>

          {this.state.error && (
            <View style={styles.detailsContainer}>
              <TouchableOpacity
                onPress={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              >
                <Text style={styles.detailsToggle}>
                  {this.state.showDetails ? 'Hide error details' : 'Show error details'}
                </Text>
              </TouchableOpacity>
              {this.state.showDetails && (
                <ScrollView style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {this.state.error.message}
                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                  </Text>
                </ScrollView>
              )}
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.reloadButton}
              onPress={() => {
                this.setState({ hasError: false, error: null, showDetails: false });
              }}
            >
              <Text style={styles.reloadText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => void Linking.openURL('mailto:support@saikowallet.app?subject=Bug Report')}
            >
              <Text style={styles.reportText}>Report Issue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    maxWidth: 400,
    width: '100%',
    alignItems: 'center',
    gap: 20,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#E31B23',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
  },
  detailsContainer: {
    width: '100%',
  },
  detailsToggle: {
    fontSize: 13,
    color: '#666',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  errorBox: {
    marginTop: 12,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    maxHeight: 160,
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#E31B23',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  reloadButton: {
    flex: 1,
    backgroundColor: '#E31B23',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reloadText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  reportButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reportText: {
    color: '#999',
    fontSize: 15,
    fontWeight: '600',
  },
});
