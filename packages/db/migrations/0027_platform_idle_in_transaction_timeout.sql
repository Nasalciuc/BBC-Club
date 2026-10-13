-- A transaction left open and idle (a client that stopped mid-transaction, a psql session left at BEGIN) keeps its locks
-- and holds back vacuum until it ends. Postgres now ends it after a minute idle. The longest legitimate wait inside a
-- transaction is an event handler's timeout, 30 s (packages/modules/platform/src/events/poller.ts): keep this twice that.
ALTER ROLE bbc SET idle_in_transaction_session_timeout = '60s';
