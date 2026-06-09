# Campus Notifications Microservice: System Design & Implementation

## Stage 1

### Core Actions Supported
1. **Fetch Notifications**: Allows the logged-in user to retrieve their notification history (read and unread items).
2. **Mark as Read**: Allows the user to acknowledge a notification, updating its status.
3. **Real-time Stream**: Establishes a persistent directional channel to push new notifications to the frontend instantly upon creation.

### REST API Contracts & Schema Design

#### 1. GET `/api/v1/notifications`
Retrieves a paginated list of notifications for the authenticated user.

* **Headers**:
  ```http
  Authorization: Bearer <JWT_TOKEN>
  Accept: application/json
  ```
* **Query Parameters**:
  * `page` (optional, integer, default: `1`)
  * `limit` (optional, integer, default: `20`)
  * `isRead` (optional, boolean)

* **JSON Response Body (Status Code: 200)**:
  ```json
  {
    "success": true,
    "data": {
      "notifications": [
        {
          "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
          "type": "Result",
          "message": "mid-sem",
          "timestamp": "2026-04-22T17:51:30Z",
          "isRead": false
        },
        {
          "id": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
          "type": "Placement",
          "message": "CSX Corporation hiring",
          "timestamp": "2026-04-22T17:51:18Z",
          "isRead": true
        }
      ],
      "pagination": {
        "currentPage": 1,
        "totalPages": 5,
        "totalItems": 92
      }
    }
  }
  ```

#### 2. PATCH `/api/v1/notifications/:id/read`
Updates the status of a specific notification to read.

* **Headers**:
  ```http
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
  ```
* **JSON Request Body**: None (The ID is supplied directly within the URL route path parameters).
* **JSON Response Body (Status Code: 200)**:
  ```json
  {
    "success": true,
    "message": "Notification marked as read successfully.",
    "data": {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "isRead": true
    }
  }
  ```

### Real-Time Notification Mechanism Design
To deliver notifications instantly without causing continuous network request polling overhead, the system will use **Server-Sent Events (SSE)** via a single persistent path endpoint:
`GET /api/v1/notifications/stream`

* **Why SSE over WebSockets?**
  1. **Unidirectional Efficiency**: Notifications flow entirely from server to client. WebSockets provide full-duplex pooling which is unnecessary here.
  2. **Native Browser Support**: Uses standard HTTP connections via the browser's native `EventSource` API with automated reconnection handling.
  3. **Low Infrastructure Overhead**: Works cleanly through standard API gateways and corporate firewalls without specialized protocol routing mapping configurations.

---

## Stage 2

### Persistent Storage Selection: PostgreSQL (Relational Database)
For an application of this type, a **Relational Database Management System (RDBMS)** like PostgreSQL is highly optimal for the initial system architecture:
* **ACID Transactions**: Ensuring data integrity when marking items as read or logging data across tables is critical.
* **Structured Constraints**: Rigid relationships between a `students` master account record table and a transactional `notifications` log history minimize orphaned or missing payloads.
* **Complex Multi-Key Queries**: Relational systems excel at indexing compound filtering keys (e.g., matching a unique `student_id`, status flags, and timestamps concurrently).

### Database Structural Schema (SQL DDL)

```sql
-- Enums representing categorical configurations
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

-- Master Students Record Table
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Event Ledger Table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Growth Obstacles & High Volume Data Engineering Solutions
As active application records expand aggressively into millions of rows, relational setups experience significant throughput degradation:
1. **Index Bloat and Memory Saturated Storage**: B-Tree indices become too large to fit into server RAM cache space, causing queries to hit disk storage arrays directly.
2. **Write Ingestion Lock Stalls**: Massive parallel `INSERT` requests block index modification trees, increasing runtime latency spikes.

#### Engineered Mitigations:
* **Horizontal Database Sharding**: Distribute records across separate physical server clusters using a hash function applied to the `student_id`.
* **Table Partitioning**: Slice the centralized data storage engine into monthly or quarterly partitions using historical boundaries on the `created_at` timestamp. Historical rows can be cleanly archived to storage warm tiers without affecting live ingestion arrays.

### Core Database Query Operations

#### Data Fetch Operation (Matches GET `/api/v1/notifications`)
```sql
SELECT id, notification_type AS "Type", message, created_at AS "Timestamp", is_read
FROM notifications
WHERE student_id = 1042
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

#### State Transition Modification (Matches PATCH `/api/v1/notifications/:id/read`)
```sql
UPDATE notifications
SET is_read = TRUE
WHERE id = 'd146095a-0d86-4a34-9e69-3900a14576bc';
```

---

## Stage 3

### Analysis of the Developer's Slowness Issue
The current query being run by the previous developer is:
```sql
SELECT * FROM notifications 
WHERE studentID = 1042 AND isRead = false 
ORDER BY createdAt DESC;
```

#### 1. Is this query accurate?
**Yes**, logically it is correct. It precisely captures the target dataset matching filtering rules.

#### 2. Why is it performing slowly?
The database is performing a costly **Sequential Scan (Full Table Scan)** across 5,000,000 records. Without an index covering these filter conditions, the storage engine must load every single row from storage blocks into memory, verify whether `studentID = 1042` and `isRead = false`, and then perform a separate memory sorting routine to process the `ORDER BY createdAt DESC` step.

#### 3. Proposed Fix & Computation Cost Evolution
We need to introduce a specialized **Composite Index** targeting the sequential operational filter constraints:
```sql
CREATE INDEX idx_notifications_student_read_date 
ON notifications (studentID, isRead, createdAt DESC);
```
* **Computation Cost Impact**: The execution cost plunges from an $O(N)$ linear table traversal down to an $O(\log N)$ lookup. The storage engine can jump directly to the target matching index node block, immediately isolating the exact unread rows for that user pre-sorted by date.

### Critical Evaluation of "Indexing Every Single Column"
The advice given by your colleague to index every column **is highly counterproductive and should be rejected**.
* **Ingestion Penalty**: Every time a record is `INSERTED`, `UPDATED`, or `DELETED`, the database must recalculate and update every index attached to that table. Indexing everything drastically slows down write throughput.
* **Storage Exhaustion**: Indexes consume physical disk blocks. Creating unstructured indices across every attribute can double or triple storage costs, squeezing out room for data memory caches.
* **Optimizer Confusion**: Query planner cost engines get bogged down evaluating multiple sub-optimal indexes, occasionally picking incorrect execution pathways.

### Query Task: Fetch Placements for All Students Within Last 7 Days
```sql
SELECT student_id, id AS "NotificationID", message, created_at
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days';
```

---

## Stage 4

### Mitigating Web Ingestion Hot Loops (Page-Load Database Bottlenecks)

When an application fetches fresh notification records directly from primary databases on every page-load lifecycle trigger, traffic spikes inevitably ground infrastructure networks to a halt.

#### Solution Strategy 1: Edge Cache Offloading (Redis Read Caching Layer)
Introduce an in-memory key-value cache layer (Redis) in front of the database.
* **Mechanisms**: When a query occurs, check Redis using a token layout like `user:1042:unread`. If a cache hit happens, return instantly. If a cache miss occurs, query the database and populate Redis with a short time-to-live (TTL) boundary. When a new message arrives, explicitly invalidate that specific user's cache block.
* **Tradeoffs**:
  * *Pros*: Moves heavy lookups into RAM storage, scaling transaction boundaries up to 100,000+ operations per second while dropping main database resource load to near zero.
  * *Cons*: Adds structural complexity and data consistency management overhead. If cache write-backs fail, users see out-of-sync indicators.

#### Solution Strategy 2: Client-Driven State Management & Local Storage Syncing
Shift data lifecycle caching responsibility down to client-side app storage boundaries.
* **Mechanisms**: On initial browser app loading sequences, request records and dump payloads directly into browser-managed `localStorage` or `IndexedDB`. Rely purely on incoming Server-Sent Events (SSE) to push incremental notifications downstream rather than re-requesting full histories on refresh actions.
* **Tradeoffs**:
  * *Pros*: Drastically cuts down inbound HTTP API load frequencies reaching your network gateways.
  * *Cons*: State can diverge if users navigate across multiple distinct devices simultaneously.

---

## Stage 5

### Shortcomings Identified in the Proposed Pseudocode Impl
```python
function notify_all(student_ids, message):
    for student_id in student_ids:
        send_email(student_id, message) # Network bottleneck call
        save_to_db(student_id, message) # Database contention stall
        push_to_app(student_id, message) # Synchronous delay loop
```
1. **Synchronous Execution Blockages**: The `for` loop executes purely sequentially. If each operation (HTTP request to Email service, DB write, SSE stream connection push) takes a combined 100ms, processing 50,000 students would freeze the runtime execution loop for **5,000 seconds (nearly 1.4 hours)**!
2. **Lack of Transaction Fault Isolation**: If `send_email` throws a network timeout error on student index 201, the entire method breaks out and crashes. The remaining 49,800 students never receive their notifications, leaving the application state fractured.
3. **High Resource Contention**: Rapidly bombarding external email APIs with 50,000 back-to-back synchronous network operations will inevitably trigger rate-limiting errors or thread exhaustion pools.

### Architectural Redesign Questions
* **Should DB Saving and Email Operations Happen Together?**
  **Absolutely not.** Saving to the database is a fast core local data storage operation, whereas sending an email relies on an unstable third-party external service network interface. They must be isolated into decoupled asynchronous tasks.

### Resilient Redesign Pseudocode (Asynchronous Event Worker Pattern)

```python
# System redesign leveraging an internal message broker queue (e.g., RabbitMQ / BullMQ)

function notify_all_resilient(student_ids, message_content):
    # 1. Create a single master campaign ledger row to preserve traceability
    campaign_id = db.insert_campaign_record(message_content)
    
    # 2. Push bulk task messages onto an optimized Message Broker Queue
    # This loop finishes in milliseconds because it doesn't wait for execution to complete
    for student_id in student_ids:
        queue.push("notification_task_queue", {
            "campaign_id": campaign_id,
            "student_id": student_id,
            "type": "Placement",
            "message": message_content
        })
        
    # Instantly return response to HR client dashboard interface
    return {"status": "Processing", "campaign_id": campaign_id}

# Background worker processes running concurrently across distributed task engines
function process_queue_worker_task(job_payload):
    student_id = job_payload.student_id
    message = job_payload.message
    
    try:
        # Step A: Persistent State Write
        save_to_db(student_id, message)
        
        # Step B: Trigger Real-time Event Stream Delivery
        push_to_app(student_id, message)
        
    except DBOrStreamException as e:
        # Log failure locally, let system re-queue the task safely
        log_middleware_retry("backend", "error", "cron_job", e.message)
        return reject_job_back_to_queue(job_payload)

    try:
        # Step C: External Email Delivery (Wrapped with dedicated retry configurations)
        send_email(student_id, message)
    except EmailAPIException as email_err:
        # If email fails, don't rollback DB storage. Track failure and route to an offline dead-letter queue.
        log_middleware_retry("backend", "warn", "service", f"Email failed for student {student_id}: {email_err.message}")
        queue.push("email_retry_queue", job_payload, max_retries=3)
```

---

## Stage 6

*See the accompanying file `priority_scheduler.js` for the fully operational code implementation handling real-time sorting weights, recency, and maintaining top-10 notification buffer sizes optimized under live insertion conditions.*