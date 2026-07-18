import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

// THE POINT OF THIS APP: the exact same shared package the web app uses.
// No duplicated types, no duplicated fetch code.
import {
  api,
  ApiFailure,
  configureApi,
  type Product,
  type ProductStatus,
} from "@dropday/shared";

import { API_BASE_URL } from "./src/config";
import { colors, mono } from "./src/theme";

// Point the shared API boundary at the deployed backend (native has no origin).
configureApi({ baseUrl: API_BASE_URL });

type LoadState = "loading" | "ready" | "error";

const STATUS_LABEL: Record<ProductStatus, string> = {
  live: "● LIVE",
  dropping_soon: "DROPPING SOON",
  sold_out: "SOLD OUT",
};

const STATUS_COLOR: Record<ProductStatus, string> = {
  live: colors.volt,
  dropping_soon: colors.ice,
  sold_out: colors.muted,
};

function StatusPill({ status }: { status: ProductStatus }) {
  const tint = STATUS_COLOR[status];
  return (
    <View style={[styles.pill, { borderColor: `${tint}66` }]}>
      <Text style={[styles.pillText, { color: tint }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function StockBar({ available, total }: { available: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, available / total)) : 0;
  const low = available <= 2;
  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barFill,
          { width: `${pct * 100}%`, backgroundColor: low ? colors.ember : colors.volt },
        ]}
      />
    </View>
  );
}

function ProductRow({
  product,
  onHold,
  holding,
}: {
  product: Product;
  onHold: (p: Product) => void;
  holding: boolean;
}) {
  const canHold = product.status === "live" && product.available > 0;
  const low = product.status === "live" && product.available <= 2 && product.available > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.swatch, { backgroundColor: product.colorway }]} />
        <View style={styles.cardHeadText}>
          <Text style={styles.name} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.blurb} numberOfLines={2}>
            {product.blurb}
          </Text>
        </View>
        <Text style={styles.price}>${product.price}</Text>
      </View>

      <View style={styles.metaRow}>
        <StatusPill status={product.status} />
        <Text style={styles.watchers}>👁 {product.watchers.toLocaleString()} watching</Text>
      </View>

      <View style={styles.stockRow}>
        <Text style={[styles.stockText, low && { color: colors.ember }]}>
          {product.status === "sold_out"
            ? "No stock left"
            : low
              ? `Only ${product.available} left`
              : `${product.available} in stock`}
        </Text>
        <Text style={styles.stockTotal}>/ {product.totalStock}</Text>
      </View>
      <StockBar available={product.available} total={product.totalStock} />

      <Pressable
        onPress={() => onHold(product)}
        disabled={!canHold || holding}
        style={({ pressed }) => [
          styles.holdBtn,
          !canHold && styles.holdBtnDisabled,
          pressed && canHold && styles.holdBtnPressed,
        ]}
      >
        <Text style={[styles.holdBtnText, !canHold && styles.holdBtnTextDisabled]}>
          {holding
            ? "Holding…"
            : product.status === "live"
              ? "Hold for 60s"
              : product.status === "dropping_soon"
                ? "Not live yet"
                : "Unavailable"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reuses the SHARED getProducts() — identical call the web store makes.
  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setState("loading");
    try {
      const { data } = await api.getProducts();
      setProducts(data);
      setState("ready");
      setError(null);
    } catch (err) {
      const message =
        err instanceof ApiFailure ? err.message : "Couldn't reach the drop server.";
      setError(message);
      setState((prev) => (prev === "ready" ? "ready" : "error"));
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load("refresh");
    setRefreshing(false);
  }, [load]);

  // Bonus: place a real 60s hold through the shared API boundary.
  const onHold = useCallback(
    async (p: Product) => {
      setHoldingId(p.id);
      setNotice(null);
      try {
        const { data: hold } = await api.placeHold(p.id, 1);
        setNotice(`Held ${hold.productName} — 60s to check out.`);
        await load("refresh");
      } catch (err) {
        setNotice(
          err instanceof ApiFailure ? err.message : "Hold failed — please try again.",
        );
      } finally {
        setHoldingId(null);
      }
    },
    [load],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.brand}>DROP DAY</Text>
        <Text style={styles.sub}>Today&apos;s Drops</Text>
      </View>

      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {state === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.volt} size="large" />
          <Text style={styles.centerText}>Loading drops…</Text>
        </View>
      ) : state === "error" ? (
        <View style={styles.center}>
          <Text style={styles.errorMark}>✕</Text>
          <Text style={styles.centerText}>{error}</Text>
          <Text style={styles.errorHint}>{API_BASE_URL}</Text>
          <Pressable onPress={() => void load("initial")} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ProductRow product={item} onHold={onHold} holding={holdingId === item.id} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.volt}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.centerText}>No drops right now.</Text>
            </View>
          }
          ListFooterComponent={
            error ? (
              <Text style={styles.staleNote}>
                Showing last-known data — {error}
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  header: {
    paddingTop: 64,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
  },
  brand: {
    ...mono,
    color: colors.volt,
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: "700",
  },
  sub: { color: colors.chalk, fontSize: 22, fontWeight: "700", marginTop: 4 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.edge },
  cardHeadText: { flex: 1 },
  name: { color: colors.chalk, fontSize: 16, fontWeight: "700" },
  blurb: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  price: { ...mono, color: colors.chalk, fontSize: 14 },

  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.ink,
  },
  pillText: { ...mono, fontSize: 10, letterSpacing: 1 },
  watchers: { ...mono, color: colors.muted, fontSize: 11 },

  stockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stockText: { ...mono, color: colors.chalk, fontSize: 13 },
  stockTotal: { ...mono, color: colors.muted, fontSize: 11 },

  barTrack: { height: 6, borderRadius: 999, backgroundColor: colors.edge, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },

  holdBtn: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: `${colors.volt}99`,
    backgroundColor: `${colors.volt}1A`,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  holdBtnPressed: { backgroundColor: `${colors.volt}33` },
  holdBtnDisabled: { borderColor: colors.edge, backgroundColor: colors.ink, opacity: 0.6 },
  holdBtnText: { ...mono, color: colors.volt, fontSize: 13, fontWeight: "700" },
  holdBtnTextDisabled: { color: colors.muted, fontWeight: "400" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  centerText: { ...mono, color: colors.muted, fontSize: 13, textAlign: "center" },
  errorMark: { color: colors.ember, fontSize: 26, ...mono },
  errorHint: { ...mono, color: colors.edge, fontSize: 11 },
  retryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: `${colors.ember}99`,
    backgroundColor: `${colors.ember}1A`,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: { ...mono, color: colors.ember, fontSize: 13 },

  notice: {
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: `${colors.volt}66`,
    backgroundColor: `${colors.volt}14`,
    borderRadius: 10,
    padding: 10,
  },
  noticeText: { ...mono, color: colors.volt, fontSize: 12 },

  staleNote: { ...mono, color: colors.muted, fontSize: 11, textAlign: "center", paddingTop: 12 },
});
