import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { AssetAIService, AssetDataSnapshot, AssetInsight } from '../services/assetAIService';
import { LLMService, ChatMessage } from '../services/llmService';
import { formatCurrency } from '../i18n/formatters';
import { useTranslation } from 'react-i18next';
import { FlingGestureHandler, Directions, State, ScrollView } from 'react-native-gesture-handler';
import { useAuth } from '../hooks/useAuth';

interface Props {
  assetId: string;
  assetType: string;
  onClose?: () => void;
}

type Tab = 'basic' | 'premium';

export function AIConsultantModule({ assetId, assetType, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('basic');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AssetDataSnapshot | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  
  // Gesture refs
  const downRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  useEffect(() => { loadData(); }, [assetId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const snapshot = await AssetAIService.aggregateAssetData(assetId, assetType, user?.email || '');
      setData(snapshot);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !data) return;
    const userMsg: ChatMessage = { role: 'user', content: inputText.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setSending(true);

    try {
      const context = AssetAIService.buildLLMContext(data);
      const reply = await LLMService.chat(updatedMessages, context);
      setMessages([...updatedMessages, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('ai.communicationError'));
      setMessages([...updatedMessages, { role: 'assistant', content: `❌ ${e.message}` }]);
    }
    setSending(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return '#059669';
    if (score >= 50) return '#D97706';
    return '#DC2626';
  };

  const getInsightStyle = (type: AssetInsight['type']) => {
    switch(type) {
      case 'danger':  return { bg: '#FEF2F2', color: '#DC2626', icon: '#DC2626' };
      case 'warning': return { bg: '#FFFBEB', color: '#92400E', icon: '#D97706' };
      case 'success': return { bg: '#ECFDF5', color: '#065F46', icon: '#059669' };
      default:        return { bg: '#EFF6FF', color: '#1E40AF', icon: '#3B82F6' };
    }
  };

  const onSwipeLeft = ({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE && tab === 'basic') {
      setTab('premium');
    }
  };

  const onSwipeRight = ({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE && tab === 'premium') {
      setTab('basic');
    }
  };

  const onSwipeDown = ({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE && onClose) {
      onClose();
    }
  };

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={S.loadingText}>{t('ai.analyzingData')}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={S.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
        <Text style={S.loadingText}>{t('ai.loadError')}</Text>
      </View>
    );
  }

  const h = data.healthScore;

  return (
    <FlingGestureHandler 
      ref={downRef}
      direction={Directions.DOWN} 
      onHandlerStateChange={onSwipeDown}
    >
      <View style={{ flex: 1 }}>
        <FlingGestureHandler 
          ref={leftRef}
          direction={Directions.LEFT} 
          onHandlerStateChange={onSwipeLeft}
        >
          <View style={{ flex: 1 }}>
            <FlingGestureHandler 
              ref={rightRef}
              direction={Directions.RIGHT} 
              onHandlerStateChange={onSwipeRight}
            >
              <View style={S.container}>
                {/* Tab selector */}
                <View style={S.tabRow}>
                  <TouchableOpacity
                    style={[S.tabBtn, tab === 'basic' && S.tabBtnActive]}
                    onPress={() => setTab('basic')}
                  >
                    <Ionicons name="analytics" size={16} color={tab === 'basic' ? '#fff' : colors.textSecondary} />
                    <Text style={[S.tabBtnT, tab === 'basic' && S.tabBtnTA]}>{t('ai.analysis')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.tabBtn, tab === 'premium' && S.tabBtnActivePremium]}
                    onPress={() => setTab('premium')}
                  >
                    <Ionicons name="sparkles" size={16} color={tab === 'premium' ? '#fff' : '#A855F7'} />
                    <Text style={[S.tabBtnT, tab === 'premium' && S.tabBtnTA, tab !== 'premium' && { color: '#A855F7' }]}>
                      {t('ai.chatAI')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {tab === 'basic' ? (
                  <ScrollView 
                    simultaneousHandlers={[downRef, leftRef, rightRef]}
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ paddingBottom: 30 }}
                   keyboardShouldPersistTaps="handled">
                    {/* Health Score */}
                    <View style={S.scoreCard}>
                      <View style={S.scoreCircle}>
                        <Text style={[S.scoreValue, { color: getScoreColor(h.overall) }]}>{h.overall}</Text>
                        <Text style={S.scoreLabel}>{t('ai.health')}</Text>
                      </View>
                      <View style={S.scoreBreakdown}>
                        {[
                          { label: t('ai.insurance'), value: h.insurance, icon: 'umbrella' },
                          { label: t('ai.costs'), value: h.costs, icon: 'wallet' },
                          { label: t('ai.stock'), value: h.stock, icon: 'cube' },
                          { label: t('ai.docs'), value: h.documentation, icon: 'document' },
                        ].map(item => (
                          <View key={item.label} style={S.scoreItem}>
                            <View style={[S.miniBar, { width: `${item.value}%`, backgroundColor: getScoreColor(item.value) }]} />
                            <View style={S.scoreItemRow}>
                              <Ionicons name={item.icon as any} size={12} color={getScoreColor(item.value)} />
                              <Text style={S.scoreItemLabel}>{item.label}</Text>
                              <Text style={[S.scoreItemVal, { color: getScoreColor(item.value) }]}>{item.value}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Insights */}
                    <Text style={S.sectionTitle}>{t('ai.insightsAlerts')}</Text>
                    {data.insights.map(insight => {
                      const style = getInsightStyle(insight.type);
                      return (
                        <View key={insight.id} style={[S.insightCard, { backgroundColor: style.bg }]}>
                          <Ionicons name={insight.icon as any} size={22} color={style.icon} />
                          <View style={S.insightContent}>
                            <Text style={[S.insightTitle, { color: style.color }]}>{insight.title}</Text>
                            <Text style={[S.insightDesc, { color: style.color }]}>{insight.description}</Text>
                          </View>
                        </View>
                      );
                    })}

                    {data.insights.length === 0 && (
                      <View style={[S.insightCard, { backgroundColor: '#ECFDF5' }]}>
                        <Ionicons name="checkmark-circle" size={22} color="#059669" />
                        <View style={S.insightContent}>
                          <Text style={[S.insightTitle, { color: '#065F46' }]}>{t('ai.allGood')}</Text>
                          <Text style={[S.insightDesc, { color: '#065F46' }]}>{t('ai.noCriticalAlerts')}</Text>
                        </View>
                      </View>
                    )}

                    {/* Quick stats */}
                    <Text style={S.sectionTitle}>{t('ai.financialSummary')}</Text>
                    <View style={S.statsRow}>
                      <View style={S.statCard}>
                        <Text style={S.statLabel}>{t('ai.premiumYear')}</Text>
                        <Text style={S.statValue}>{data.totalPremium > 0 ? formatCurrency(data.totalPremium) : '—'}</Text>
                      </View>
                      <View style={S.statCard}>
                        <Text style={S.statLabel}>{t('ai.avgMonthly')}</Text>
                        <Text style={S.statValue}>{data.avgMonthlyExpense > 0 ? formatCurrency(data.avgMonthlyExpense) : '—'}</Text>
                      </View>
                    </View>
                    <View style={S.statsRow}>
                      <View style={S.statCard}>
                        <Text style={S.statLabel}>{t('ai.stockValue')}</Text>
                        <Text style={S.statValue}>{data.totalStockValue > 0 ? formatCurrency(data.totalStockValue) : '—'}</Text>
                      </View>
                      <View style={S.statCard}>
                        <Text style={S.statLabel}>{t('ai.documents')}</Text>
                        <Text style={S.statValue}>{data.totalDocuments}</Text>
                      </View>
                    </View>
                  </ScrollView>
                ) : (
                  /* Chat Tab */
                  <View style={{ flex: 1 }}>
                    <View style={{ flex: 1 }}>
                      {/* Chat messages */}
                      <ScrollView
                        ref={scrollRef}
                        simultaneousHandlers={[downRef, leftRef, rightRef]}
                        style={S.chatArea}
                        contentContainerStyle={{ paddingBottom: 10 }}
                        keyboardShouldPersistTaps="handled"
                        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                      >
                        {messages.length === 0 && (
                          <View style={S.chatWelcome}>
                            <Ionicons name="sparkles" size={32} color="#A855F7" />
                            <Text style={S.chatWelcomeT}>{t('ai.welcomeTitle')}</Text>
                            <Text style={S.chatWelcomeS}>{t('ai.welcomeSub')}</Text>
                            <View style={S.suggestionsWrap}>
                              {[
                                t('ai.q1'),
                                t('ai.q2'),
                                t('ai.q3'),
                                t('ai.q4'),
                              ].map(q => (
                                <TouchableOpacity key={q} style={S.suggestion} onPress={() => { setInputText(q); }}>
                                  <Text style={S.suggestionT}>{q}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}

                        {messages.map((msg, i) => (
                          <View key={i} style={[S.bubble, msg.role === 'user' ? S.bubbleUser : S.bubbleAI]}>
                            {msg.role === 'assistant' && <Ionicons name="sparkles" size={14} color="#A855F7" style={{ marginRight: 6, marginTop: 2 }} />}
                            <Text style={[S.bubbleText, msg.role === 'user' && S.bubbleTextUser]}>{msg.content}</Text>
                          </View>
                        ))}

                        {sending && (
                          <View style={[S.bubble, S.bubbleAI]}>
                            <ActivityIndicator size="small" color="#A855F7" />
                            <Text style={[S.bubbleText, { marginLeft: 8 }]}>{t('ai.thinking')}</Text>
                          </View>
                        )}
                      </ScrollView>

                      {/* Input bar */}
                      <View style={S.inputBar}>
                        <TextInput
                          style={S.chatInput}
                          placeholder={t('ai.askPlaceholder')}
                          value={inputText}
                          onChangeText={setInputText}
                          onSubmitEditing={sendMessage}
                          returnKeyType="send"
                          editable={!sending}
                          blurOnSubmit={false}
                        />
                        <TouchableOpacity
                          style={[S.sendBtn, (!inputText.trim() || sending) && { opacity: 0.4 }]}
                          onPress={sendMessage}
                          disabled={!inputText.trim() || sending}
                        >
                          <Ionicons name="send" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </FlingGestureHandler>
          </View>
        </FlingGestureHandler>
      </View>
    </FlingGestureHandler>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 11, color: colors.textSecondary, marginTop: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Tabs
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  tabBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabBtnActivePremium: { backgroundColor: '#A855F7', borderColor: '#A855F7' },
  tabBtnT: { fontSize: 11, fontWeight: '900', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabBtnTA: { color: '#fff' },

  // Score
  scoreCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  scoreCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 20 },
  scoreValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  scoreLabel: { fontSize: 7, fontWeight: '900', color: colors.textLight, letterSpacing: 1, textTransform: 'uppercase' },
  scoreBreakdown: { flex: 1, justifyContent: 'center', gap: 8 },
  scoreItem: {},
  scoreItemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreItemLabel: { fontSize: 9, fontWeight: '800', color: colors.textSecondary, flex: 1, textTransform: 'uppercase' },
  scoreItemVal: { fontSize: 11, fontWeight: '900' },
  miniBar: { height: 2, borderRadius: 2, marginBottom: 4 },

  // Insights
  sectionTitle: { fontSize: 9, fontWeight: '900', color: colors.textLight, letterSpacing: 1.2, marginBottom: 12, marginTop: 4, textTransform: 'uppercase' },
  insightCard: { flexDirection: 'row', padding: 14, borderRadius: 14, marginBottom: 8, alignItems: 'flex-start', gap: 12 },
  insightContent: { flex: 1 },
  insightTitle: { fontSize: 12, fontWeight: '900', marginBottom: 3, letterSpacing: -0.2 },
  insightDesc: { fontSize: 10, fontWeight: '600', lineHeight: 15, opacity: 0.85 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  statLabel: { fontSize: 7, fontWeight: '900', color: colors.textLight, letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue: { fontSize: 14, fontWeight: '900', color: colors.primary, marginTop: 4, letterSpacing: -0.3 },

  // Chat
  chatArea: { flex: 1, paddingBottom: 10 },
  chatWelcome: { alignItems: 'center', paddingTop: 30, paddingHorizontal: 20 },
  chatWelcomeT: { fontSize: 14, fontWeight: '900', color: colors.primary, marginTop: 12, letterSpacing: -0.3 },
  chatWelcomeS: { fontSize: 11, color: colors.textSecondary, marginTop: 4, marginBottom: 20, fontWeight: '500' },
  suggestionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  suggestion: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#E9D5FF' },
  suggestionT: { fontSize: 9, fontWeight: '900', color: '#7C3AED', textTransform: 'uppercase' },

  bubble: { maxWidth: '85%', padding: 14, borderRadius: 18, marginBottom: 8, flexDirection: 'row' },
  bubbleUser: { backgroundColor: colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: '#F3E8FF', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 13, fontWeight: '600', color: '#1E1B4B', lineHeight: 18, flex: 1 },
  bubbleTextUser: { color: '#fff' },

  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  chatInput: { flex: 1, backgroundColor: colors.background, padding: 12, borderRadius: 14, fontSize: 13, fontWeight: '700', borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#A855F7', justifyContent: 'center', alignItems: 'center' },
});
