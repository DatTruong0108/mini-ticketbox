# TÀI LIỆU KỸ THUẬT HỆ THỐNG ĐẶT VÉ CA NHẠC TICKETBOX

Chào mừng bạn đến với tài liệu kỹ thuật chi tiết của hệ thống **TicketBox** – giải pháp đặt vé ca nhạc hiệu năng cao, tối ưu hóa xử lý đồng thời (high-concurrency) và hỗ trợ cập nhật trạng thái thời gian thực (real-time).

Dự án này được thiết kế và phát triển bởi tác giả **Trương Tấn Đạt (Software/API Engineer)**.

---

## 1. Thông tin chung (General Information)

### 1.1 Giới thiệu dự án, Tech Stack, Môi trường và Cấu trúc

**TicketBox** là một ứng dụng full-stack hoàn chỉnh được xây dựng để giải quyết bài toán cốt lõi trong ngành bán vé: **Đặt vé tốc độ cao tại cùng một thời điểm mở bán mà không xảy ra tình trạng bán lố (overselling)**. Hệ thống được thiết kế theo kiến trúc phân lớp rõ ràng, đảm bảo tính nhất quán dữ liệu ở mức độ cao nhất và phản hồi giao diện mượt mà cho người dùng cuối.

#### Công nghệ sử dụng (Tech Stack):
*   **Frontend**: [Next.js 15+ (App Router)] viết bằng TypeScript, tối ưu hóa SEO và hiệu năng hiển thị.
*   **Backend**: [NestJS (Node.js framework)] xây dựng hệ thống API RESTful và Gateway WebSocket mạnh mẽ.
*   **Database**: **PostgreSQL 17** lưu trữ trạng thái bền vững của giao dịch, người dùng và thông tin vé.
*   **Cache & Message Broker**: **Redis 7** đóng vai trò là "chốt chặn" kiểm soát truy cập đồng thời ở lớp bộ nhớ đệm và quản lý vòng đời giữ vé (ticket hold TTL).
*   **ORM**: **Prisma** giúp tương tác cơ sở dữ liệu an toàn kiểu dữ liệu (type-safe).
*   **Containerization**: **Docker & Docker Compose** đóng gói toàn bộ môi trường chạy thực tế chỉ với một lệnh duy nhất.
*   **Real-time**: **WebSockets** đồng bộ hóa số lượng vé khả dụng tức thời giữa tất cả Client và màn hình Admin.

#### Cấu trúc thư mục Monorepo:
Dự án được cấu trúc rõ ràng dưới dạng Monorepo thu nhỏ giúp dễ quản lý và triển khai:
```text
mini-ticketbox/
├── docker-compose.yml               # Cấu hình container chạy toàn hệ thống (Postgres, Redis, Backend, Frontend)
├── README.md                          # File tài liệu hướng dẫn kỹ thuật này
├── ticketbox-backend/               # Dự án NestJS API Service & WebSocket Gateway
│   ├── prisma/                      # Schema cơ sở dữ liệu, script seed dữ liệu và script phân quyền Admin
│   ├── src/                         # Mã nguồn NestJS (Auth, Tickets, Redis, Common...)
│   └── Dockerfile                   # Cấu hình đóng gói container cho Backend
└── ticketbox-frontend/              # Dự án Next.js Client Portal & Admin Dashboard
    ├── src/
    │   ├── app/                     # Next.js App Router (Page, Layout, Middleware)
    │   ├── components/              # Các UI Components dùng chung (Modal, Toast, Countdown, Charts)
    │   └── middleware.ts            # Middleware bảo vệ route phía Client
    └── Dockerfile                   # Cấu hình đóng gói container cho Frontend
```

---

### 1.2 Luồng hoạt động của hệ thống (System Workflow)

Luồng nghiệp vụ của hệ thống được tối giản hóa tối đa nhưng vẫn giữ nguyên các cơ chế kiểm soát nghiêm ngặt của một hệ thống thương mại điện tử thực tế (Để nhìn rõ nguồn hơn, có thể tải thêm extension [Mermaid](MermaidChart.vscode-mermaid-chart) trong mục Extensions của IDE):

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant FE as Frontend (Next.js)
    participant BE as Backend (NestJS)
    participant RD as Redis Cache
    participant DB as PostgreSQL

    User->>FE: Truy cập localhost:3000
    Note over FE: Kiểm tra Middleware
    FE->>User: Chưa đăng nhập -> Chuyển hướng về trang Login "/"
    
    User->>FE: Nhập UserName và click Login
    FE->>BE: Gọi API Login (chỉ cần UserName)
    BE->>DB: Truy vấn/Tạo mới User (UserName là duy nhất)
    DB-->>BE: Trả về thông tin User & Role
    BE-->>FE: Cấp Access/Refresh Token dưới dạng Cookies
    FE->>FE: Chuyển hướng tới trang "/event" (Event Page)

    FE->>BE: Kết nối WebSocket & Fetch thông tin loại vé
    BE-->>FE: Trả về danh sách vé (STANDARD, VIP) kèm số lượng khả dụng

    User->>FE: Click "Mua vé ngay" -> Mở modal chọn vé
    Note over User,FE: Áp dụng quy tắc mua hàng:<br/>- Chỉ mua 1 loại vé mỗi giao dịch<br/>- Tối đa 5 vé<br/>- Giới hạn động theo lượng tồn thực tế

    User->>FE: Xác nhận số lượng -> Click "Tiến hành giữ vé"
    FE->>BE: Gọi API Hold Tickets (UserId, TicketType, Quantity)
    
    Note over BE: Thực hiện Dual-Gate Concurrency Control
    BE->>RD: Gate 1: Tăng quota cá nhân (user_quota) -> Kiểm tra <= 5
    BE->>RD: Gate 2: Giảm số lượng tổng (tickets_available) -> Kiểm tra >= 0
    BE->>DB: Gate 3: Bắt đầu Transaction tìm vé AVAILABLE & cập nhật sang HOLD kèm ExpiresAt
    BE->>RD: Thiết lập Key TTL (ticket_hold:id, TTL 5 phút)
    BE-->>FE: Trả về danh sách vé đã giữ thành công
    BE->>FE: Phát tín hiệu WebSocket cập nhật lượng tồn tới các Client khác

    FE->>FE: Chuyển hướng tới "/event/checkout"
    Note over FE: Hiển thị Countdown Timer đồng bộ 5 phút

    alt Hết 5 phút hoặc Người dùng click "Hủy giữ vé"
        FE->>BE: Gọi API hủy giữ vé (hoặc Redis Key Expiration tự kích hoạt)
        BE->>DB: Cập nhật vé HOLD -> AVAILABLE (Xóa UserId, ExpiresAt)
        BE->>RD: Hoàn trả lại số lượng khả dụng và quota người dùng
        BE->>FE: Phát tín hiệu WebSocket cập nhật lượng tồn
        FE->>FE: Chuyển hướng ngược lại trang "/event" với thông báo hết hạn/hủy
    else Người dùng nhấn "Thanh toán" trước 5 phút
        FE->>BE: Gọi API Payment (OrderId/TicketIds)
        BE->>DB: Transaction chuyển trạng thái vé HOLD -> SOLD, Order -> PAID
        BE->>RD: Xóa các key giữ vé trong Redis
        BE-->>FE: Xác nhận thanh toán thành công
        FE->>User: Hiển thị Popup chúc mừng và chuyển hướng về trang "/event"
    end

    Note over User,FE: Quyền truy cập Admin Portal
    User->>FE: Truy cập "/admin"
    Note over FE: Middleware kiểm tra Token & Quyền hạn
    alt Quyền USER
        FE->>User: Chuyển hướng về "/event" (Từ chối truy cập)
    else Quyền ADMIN
        FE->>BE: Kết nối WebSocket Admin Dashboard
        BE-->>FE: Stream trực tiếp doanh thu, biểu đồ, lượng vé thực tế thời gian thực
        FE->>User: Hiển thị giao diện quản trị Admin Portal
    end
```

#### Chi tiết quy tắc mua vé (Ticket Selection Rules):
1.  **Một loại vé duy nhất trên mỗi giao dịch**: Người dùng không thể mua đồng thời cả vé VIP và STANDARD trong cùng một đơn hàng. Nếu muốn đổi loại vé, họ phải mua hoặc hủy lượt giữ hiện tại.
2.  **Giới hạn số lượng động (Dynamic Quantity Limit)**:
    *   Giới hạn mặc định tối đa là **5 vé** cho mỗi người dùng.
    *   Nếu lượng vé còn lại trong hệ thống lớn hơn 5, giới hạn lựa chọn trong Dropdown/Input là **5**.
    *   Nếu lượng vé còn lại nhỏ hơn hoặc bằng 5 (ví dụ: chỉ còn 3 vé VIP), giới hạn tối đa sẽ tự động co giãn về đúng số lượng còn lại (**3**). Người dùng không thể chọn vượt quá số vé khả dụng thực tế này.

### 1.3 Ý đồ kiến trúc và Lựa chọn công nghệ (Architectural Decisions & Rationale)

Để xây dựng một hệ thống đặt vé ca nhạc hiệu năng cao có khả năng chịu tải đột biến tốt, tôi đã đưa ra các quyết định thiết kế và lựa chọn công nghệ dựa trên các phân tích chuyên sâu sau:

*   **1. NestJS (Backend - Lớp dịch vụ API)**
    *   *Lý do lựa chọn*: NestJS cung cấp một kiến trúc chuẩn doanh nghiệp (Enterprise-grade architecture) chặt chẽ, hỗ trợ cơ chế Dependency Injection (DI) mạnh mẽ và tính mô-đun hóa cao ngay từ đầu. Đối với các nghiệp vụ phức tạp và đòi hỏi độ chính xác tuyệt đối như giữ vé (ticket hold) và thanh toán (payment), sự rõ ràng trong cấu trúc mã nguồn và khả năng mở rộng của NestJS là yếu tố quyết định giúp hệ thống luôn ổn định và dễ bảo trì khi quy mô dự án mở rộng.
*   **2. Next.js (Frontend - Lớp giao diện người dùng)**
    *   *Lý do lựa chọn*: Next.js là sự kết hợp hoàn hảo giữa Server Components (tối ưu hóa việc kết xuất trang ban đầu từ phía máy chủ và hỗ trợ SEO tốt) cùng Client Components (phục vụ cho các tương tác động phức tạp ở phía người dùng). Sự linh hoạt này giúp tối ưu hóa hiệu năng hiển thị và mang lại trải nghiệm người dùng liền mạch thông qua kiến trúc App Router hiện đại.
*   **3. PostgreSQL (Cơ sở dữ liệu quan hệ)**
    *   *Lý do lựa chọn*: Trong các bài toán liên quan đến giao dịch và thanh toán tài chính, tính nhất quán dữ liệu là nguyên tắc tối thượng (non-negotiable). PostgreSQL tuân thủ tuyệt đối chuẩn ACID, hỗ trợ toàn diện tính toàn vẹn dữ liệu quan hệ qua ràng buộc khóa ngoại (foreign keys), các cơ chế transaction phức tạp và khóa dòng (locking mechanisms) mạnh mẽ để đảm bảo không xảy ra hiện tượng mất mát dữ liệu hoặc bán lố vé.
*   **4. Redis (Bộ nhớ đệm & Kiểm soát đồng thời)**
    *   *Lý do lựa chọn*: Là hệ lưu trữ dữ liệu trên bộ nhớ đệm (in-memory) có tốc độ truy xuất cực kỳ nhanh. Trong dự án này, Redis đóng hai vai trò trọng yếu:
        1.  *Chốt chặn lưu lượng*: Xử lý hàng ngàn yêu cầu giữ vé đồng thời ở lớp bộ đệm bằng các câu lệnh nguyên tử (atomic operations) để bảo vệ và tránh gây tắc nghẽn (bottleneck) cho cơ sở dữ liệu PostgreSQL phía sau.
        2.  *Giải phóng tài nguyên tự động*: Sử dụng cơ chế Keyspace Notifications với thời gian sống (TTL) 5 phút cho mỗi lượt giữ vé. Khi khóa hết hạn, hệ thống tự động kích hoạt tiến trình giải phóng vé mà không cần chạy các tác vụ quét định kỳ (heavy CRON jobs) tốn kém tài nguyên.
*   **5. WebSockets (Giao tiếp thời gian thực)**
    *   *Lý do lựa chọn*: Thay thế hoàn toàn cho các giải pháp kéo dữ liệu truyền thống (HTTP Short/Long Polling). Trong bối cảnh đặt vé mang tính cạnh tranh cao (FOMO), người dùng và quản trị viên cần nắm bắt số lượng vé thay đổi từng mili-giây. WebSockets duy trì một kết nối song hướng bền vững (persistent connection), giảm tải tối đa cho máy chủ và giảm thiểu độ trễ mạng so với việc liên tục gửi các yêu cầu REST API.
*   **6. Oxide.ts (Kiểm soát và Dự đoán lỗi)**
    *   *Lý do lựa chọn*: Đưa các pattern thiết kế an toàn của ngôn ngữ Rust như `Result<T, E>` và `Option<T>` vào môi trường TypeScript. Cách tiếp cận này giúp loại bỏ hoàn toàn các cấu trúc "try/catch hell" lồng nhau phức tạp, buộc lập trình viên phải tường minh hóa việc xử lý cả hai kịch bản thành công và thất bại tại thời điểm biên dịch, từ đó giúp mã nguồn backend hoạt động vô cùng ổn định và dễ dự đoán.
*   **7. Docker & Docker Compose (Nhất quán hạ tầng)**
    *   *Lý do lựa chọn*: Triệt tiêu hoàn toàn vấn đề kinh điển "chạy được trên máy tôi nhưng lỗi trên máy khác". Việc đóng gói toàn bộ hạ tầng từ Cơ sở dữ liệu, Bộ nhớ đệm, API Service đến Web UI vào các container Docker cho phép khởi dựng toàn bộ dự án chỉ với một câu lệnh `docker-compose`, thiết lập sự đồng nhất tuyệt đối giữa môi trường phát triển cục bộ, kiểm thử và vận hành thực tế.

---

## 2. Các kỹ thuật xử lý bài toán (Technical Implementations)

### 2.1 Backend (NestJS)

Dịch vụ backend được xây dựng trên triết lý **Predictable & Concurrency-Safe** (Dễ đoán và an toàn trong truy cập đồng thời).

#### A. Xử lý đồng thời cao (Concurrency Handling) & Chống bán lố (Overselling)
Trong sự kiện mở bán vé lớn, hàng ngàn yêu cầu có thể đến trong cùng một giây. Nếu chỉ sử dụng các truy vấn cơ sở dữ liệu truyền thống (ví dụ: `SELECT COUNT`, sau đó `INSERT`), hiện tượng **Race Condition** sẽ xảy ra dẫn đến bán lố vé. Hệ thống TicketBox giải quyết triệt để vấn đề này bằng mô hình **Dual-Gate Concurrency Control**:

1.  **Gate 1 (User Quota Gate - Redis)**: Sử dụng lệnh atomic `INCRBY` trên Redis để quản lý số lượng vé một người dùng đang giữ hoặc đã mua (`user_quota:{userId}`). Nếu vượt quá 5, yêu cầu bị từ chối ngay lập tức mà không cần truy vấn DB.
2.  **Gate 2 (Global Pool Gate - Redis)**: Redis đóng vai trò chốt chặn luồng lưu lượng (traffic gatekeeper). Lượng vé khả dụng được đồng bộ trong Redis key `tickets_available`. Khi người dùng yêu cầu giữ $N$ vé, hệ thống thực hiện phép trừ nguyên tử `DECRBY tickets_available N`. Nếu kết quả âm, hệ thống biết ngay lập tức vé đã cháy và hoàn trả trạng thái (rollback quota) ngay, loại bỏ 99% lưu lượng rác trước khi chạm vào Database.
3.  **Gate 3 (DB Transaction Guard - PostgreSQL)**:
    *   Khi vượt qua hai chốt chặn Redis, một Database Transaction (`$transaction` của Prisma) được thiết lập.
    *   Hệ thống thực hiện câu lệnh tìm kiếm chính xác số lượng vé dạng `AVAILABLE` theo đúng loại vé được yêu cầu, sau đó cập nhật hàng loạt trạng thái của chúng thành `HOLD` kèm theo thông tin `userId` và thời điểm hết hạn `expiresAt`.
    *   Nếu số lượng vé tìm thấy trong DB không khớp với số lượng yêu cầu (do sự lệch pha hoặc lỗi hệ thống), Transaction sẽ bị hủy bỏ (Aborted/Rollback) để đảm bảo tính nhất quán tối đa.

#### B. Cơ chế Redis TTL & Trực quan hóa thời gian thực với WebSockets
*   **Redis Keyspace Notifications**: Khi vé được chuyển sang trạng thái `HOLD`, một khóa Redis dạng `ticket_hold:{ticketId}` được tạo với thời gian sống (TTL) là 300 giây (5 phút). Backend cấu hình lắng nghe sự kiện hết hạn khóa (`notify-keyspace-events Ex` trong Redis). Khi một khóa hết hạn, Redis phát đi tín hiệu, Backend nhận được và tự động kích hoạt tiến trình giải phóng vé (mở khóa trạng thái từ `HOLD` về `AVAILABLE` trong Postgres, cộng lại số lượng trong Redis pool và giảm quota người dùng tương ứng).
*   **WebSockets (Socket.IO)**: Nhằm cung cấp giao diện phản hồi tức thì, Backend sử dụng Gateway WebSocket để phát sóng (broadcast) số lượng vé còn lại tới tất cả các kết nối Client đang hoạt động bất cứ khi nào số lượng vé có biến động (giữ vé thành công, hủy giữ, hết hạn giữ, hoặc thanh toán hoàn tất).

#### C. Quản lý phân quyền nghiêm ngặt (Role-Based Access Control - RBAC)
Hệ thống phân tách rõ ràng hai vai trò: `USER` và `ADMIN` thông qua bộ đôi Guard:
*   [jwt-auth.guard.ts](/ticketbox-backend/src/auth/guards/jwt-auth.guard.ts): Xác thực chữ ký mã JWT trong Request Header/Cookies để nhận diện người dùng.
*   [roles.guard.ts](/ticketbox-backend/src/auth/guards/roles.guard.ts): Đối chiếu quyền hạn của người dùng lấy từ Payload Token với yêu cầu của API Route. Mọi tài nguyên thuộc `/admin` hoặc các Endpoint quản trị trên Backend bắt buộc phải có vai trò `ADMIN`.

#### D. Chuẩn hóa API và Dữ liệu Đầu Vào
*   **Swagger Documentation**: Tích hợp `@nestjs/swagger` giúp tự động sinh tài liệu API trực quan tại địa chỉ `http://localhost:3001/api/docs`. Nhà phát triển có thể thử nghiệm trực tiếp các Endpoint tại đây.
*   **Class Validator**: Áp dụng quy tắc "Không bao giờ tin tưởng dữ liệu từ Client". Tất cả các DTO (Data Transfer Objects) đều được ràng buộc chặt chẽ bằng các decorator như `@IsUUID()`, `@IsInt()`, `@Min(1)`, `@Max(5)` từ thư viện `class-validator`, lọc sạch dữ liệu rác trước khi đưa vào tầng xử lý logic.
*   **Global Error Handling**: Triển khai Exception Filter toàn cục để bắt mọi ngoại lệ và định dạng lại cấu trúc lỗi trả về theo chuẩn đồng nhất (JSON chứa timestamp, path, message rõ ràng), giúp Frontend dễ dàng bắt lỗi và hiển thị.

#### E. Lập trình dự đoán lỗi với Oxide.ts
Thay vì lạm dụng cơ chế ném lỗi `throw new Error()` gây phá vỡ luồng thực thi và khó kiểm soát ngăn xếp cuộc gọi (call stack), Backend áp dụng thư viện `oxide.ts`.
*   Các phương thức nghiệp vụ cốt lõi tại [tickets.service.ts](file:///d:/TRUONG%20TAN%20DAT/Projects/mini-ticketbox/ticketbox-backend/src/tickets/tickets.service.ts) trả về kiểu dữ liệu `Result<T, Error>` (với hai trạng thái `Ok` và `Err`) mô phỏng theo ngôn ngữ Rust.
*   Điều này buộc lập trình viên phải xử lý lỗi một cách tường minh và an toàn tại lớp Controller, tăng độ ổn định của hệ thống.

#### F. Unit Testing
Bộ mã nguồn nghiệp vụ chính được bao phủ bởi các bài kiểm thử đơn vị (Unit Tests) sử dụng Jest. Các kịch bản kiểm thử giả lập nhiều yêu cầu giữ vé cùng lúc để kiểm chứng tính đúng đắn của logic trừ số lượng tồn và hoàn trả hạn mức.

---

### 2.2 Frontend (Next.js)

Giao diện được thiết kế hướng tới trải nghiệm người dùng tối đa (User-Centric) và khả năng tương tác nhanh chóng.

#### A. UI/UX Hiện Đại & Responsive
*   Sử dụng ngôn ngữ thiết kế trẻ trung, năng động với bảng màu hiện đại kết hợp hiệu ứng kính (glassmorphism), chuyển động vi mô (micro-animations) mượt mà bằng CSS Transitions. Giao diện đáp ứng tốt (fully responsive) trên cả thiết bị di động, máy tính bảng và màn hình máy tính lớn.

#### B. Cơ chế Xử lý Độ Trễ Mạng (Network Lag)
*   Để đối phó với mạng chập chờn hoặc phản hồi trễ từ máy chủ, tất cả các nút bấm thực hiện tác vụ nặng (như nút "Thanh toán", "Giữ vé") đều tự động chuyển sang trạng thái Disable ngay khi được nhấn và hiển thị hiệu ứng Loading Spinner. Điều này ngăn chặn triệt để hành vi bấm liên tục (double-submit) từ phía người dùng.

#### C. Chống Spam & Xử lý Tràn Lưu Lượng (Rate Limiting Response)
*   Tích hợp bộ bắt lỗi HTTP toàn cục. Khi máy chủ trả về mã lỗi `429 Too Many Requests`, hệ thống Frontend sẽ hiển thị thông báo Toast cảnh báo người dùng thao tác quá nhanh, hướng dẫn họ đợi vài giây trước khi thử lại, bảo vệ hệ thống khỏi các hành vi spam click vô ý hoặc cố ý.

#### D. Trạng thái Loading và Toast Feedback rõ ràng
*   Sử dụng Skeleton Loading khi dữ liệu đang được tải từ máy chủ để tránh bố cục trang bị dịch chuyển đột ngột (Layout Shift).
*   Mọi hành động thành công hay thất bại đều đồng hành cùng thông báo Toast trực quan (sử dụng thư viện thông báo góc màn hình) hiển thị chi tiết nguyên nhân lỗi hoặc chúc mừng giao dịch.

#### E. Đồng bộ hóa bộ đếm ngược (Countdown Timer) chính xác
*   Bộ đếm ngược 5 phút giữ vé ở trang Checkout được lập trình đồng bộ hóa chính xác từng giây với thời gian hết hạn thực tế từ máy chủ (`expiresAt`).
*   Khi tab trình duyệt bị ẩn đi và mở lại, hoặc khi máy tính bị sleep rồi thức dậy, bộ đếm tự động lấy lại mốc thời gian hệ thống thực tế để tính toán lại giây còn lại thay vì chạy sai lệch so với thời gian thực trên Backend.

#### F. Màn hình sự kiện thời gian thực (Real-time Event Page)
*   Trang chủ sự kiện kết nối trực tiếp tới Socket Server. Bất cứ khi nào có người dùng khác giữ vé hay thanh toán thành công, số lượng vé khả dụng của hai hạng STANDARD và VIP trên giao diện của tất cả các Client khác sẽ ngay lập tức giảm xuống mà không cần tải lại trang.

#### G. Trang quản trị Dashboard thời gian thực (Real-time Admin Dashboard)
*   Trang quản trị tại đường dẫn `/admin` cung cấp cái nhìn toàn cảnh về hiệu suất bán vé:
    *   Tổng doanh thu tích lũy.
    *   Tỷ lệ phần trăm và số lượng cụ thể của vé đã bán (SOLD), đang được giữ (HOLD) và còn trống (AVAILABLE).
    *   Biểu đồ phân bố lượng vé bán ra theo từng hạng vé.
    *   **Đặc biệt**: Tất cả các chỉ số trên màn hình Admin này được truyền trực tiếp (stream) thời gian thực thông qua kết nối WebSocket chuyên biệt từ máy chủ. Giúp Admin liên tục theo dõi tiến độ sự kiện mở bán mà không cần thực hiện hành vi gọi lại API định kỳ (short/long polling), giảm tải tối đa cho cơ sở dữ liệu.

#### H. Kiến trúc Phân Tách và Middleware Bảo Vệ
*   **App Router Separation**: Tuân thủ tuyệt đối quy tắc của Next.js App Router. Phân chia rõ ràng giữa Server Components (để render giao diện ban đầu siêu tốc) và Client Components (cho các phần tương tác động như đếm ngược, biểu đồ, kết nối socket).
*   **Edge Middleware**: [middleware.ts](/ticketbox-frontend/src/middleware.ts) đóng vai trò người gác cổng tại rìa (edge runtime). Khi phát hiện người dùng chưa có Token cố tình truy cập vào các đường dẫn nhạy cảm như `/event/checkout` hoặc `/admin`, Middleware sẽ chặn lại ngay từ cấp trình duyệt và chuyển hướng về trang đăng nhập nhằm tiết kiệm tài nguyên máy chủ.

---

## 3. Hướng dẫn chạy Local (Local Setup Guide)

Dưới đây là các bước chi tiết để thiết lập và khởi chạy toàn bộ hệ thống TicketBox trên môi trường máy tính cá nhân của bạn.

### Yêu cầu tiên quyết (Prerequisites)
Hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:
1.  **Docker** và **Docker Compose** (đã được bật và sẵn sàng hoạt động).
2.  **Node.js** (Phiên bản khuyến nghị: từ 18 trở lên, để kiểm tra các công cụ phụ trợ nếu cần).

---

### Bước 1: Khởi động hệ thống bằng Docker Compose

Mở thư mục gốc của dự án `mini-ticketbox` (nơi chứa file `docker-compose.yml`) trong Terminal (PowerShell hoặc CMD trên Windows) và chạy lệnh sau để build và khởi chạy toàn bộ 4 dịch vụ (PostgreSQL, Redis, Backend, Frontend) chạy ngầm:

```bash
docker-compose up --build -d
```

*Giải thích tham số:*
*   `--build`: Yêu cầu Docker dựng lại ảnh container mới nhất cho Frontend và Backend.
*   `-d`: Chạy dưới nền (detached mode), giải phóng terminal của bạn.

Sau khi chạy xong, hãy xác minh các cổng hoạt động bình thường:
*   **Next.js Frontend**: `http://localhost:3000`
*   **NestJS Backend**: `http://localhost:3001`
*   **PostgreSQL Database**: Cổng host `5434` (được ánh xạ từ cổng gốc `5432` trong container)
*   **Redis Cache**: Cổng `6379`

---

### Bước 2: Kiểm tra kết nối Cơ sở dữ liệu bằng pgAdmin

Bạn có thể sử dụng bất kỳ công cụ quản lý cơ sở dữ liệu nào (DBeaver, TablePlus, hoặc pgAdmin) để kết nối trực tiếp đến PostgreSQL chạy trong Docker nhằm kiểm tra trạng thái bảng và dữ liệu.

Thông số kết nối chi tiết:
*   **Connection URL**:
    ```text
    postgresql://postgres:tora01082003@localhost:5434/ticketbox_db?schema=public
    ```
*   **Host**: `localhost` (hoặc `127.0.0.1`)
*   **Port**: `5434` (Lưu ý: Không dùng cổng mặc định 5432 nếu máy bạn đã có sẵn Postgres cài ngoài)
*   **Database Name**: `ticketbox_db`
*   **Username**: `postgres`
*   **Password**: `tora01082003`

---

### Bước 3: Tạo dữ liệu mẫu (Seeding Data)

Sau khi cơ sở dữ liệu đã khởi động thành công, cơ sở dữ liệu ban đầu sẽ hoàn toàn trống. Hệ thống cần được nạp **500 vé** mẫu (400 vé STANDARD giá 500,000 VND và 100 vé VIP giá 1,500,000 VND).

Hãy chạy lệnh sau trong Terminal để thực thi file seed nằm bên trong container Backend:

```bash
docker exec -it ticketbox-backend npx tsx prisma/seed.ts
```

*Mô tả kết quả*:
*   Lệnh trên sẽ kết nối trực tiếp vào container `ticketbox-backend` và chạy file seed bằng trình biên dịch TypeScript trực tiếp `tsx`.
*   Màn hình sẽ hiển thị thông báo nạp thành công dữ liệu vé vào bảng `tickets`. Số lượng vé khả dụng trên trang chủ lập tức được đồng bộ lên 500.

---

### Bước 4: Thiết lập người dùng làm Quản trị viên (Set Admin)

Để truy cập vào trang Dashboard quản trị tại `/admin`, bạn cần có một tài khoản với quyền `ADMIN`. Hãy làm theo các bước sau:

#### Cách 1: Sử dụng Script tự động (Khuyến nghị nhanh nhất)
1.  Truy cập vào trang chủ `http://localhost:3000` và tiến hành đăng nhập với tên người dùng bạn muốn (ví dụ: `dat_admin`).
2.  Sau khi đăng nhập thành công và được chuyển tới trang `/event`, chạy lệnh terminal sau để tự động nâng cấp người dùng đầu tiên đăng ký lên vai trò `ADMIN`:
    ```bash
    docker exec -it ticketbox-backend npx tsx prisma/set-admin.ts
    ```
3.  Script sẽ tự động quét người dùng trong bảng `users`, chuyển vai trò của họ sang `ADMIN` và thông báo trên terminal. Lúc này, bạn có thể gõ `/admin` vào thanh địa chỉ trình duyệt để vào trang quản trị ngay.

#### Cách 2: Cập nhật thủ công qua pgAdmin / Query Tool
Nếu muốn kiểm soát chi tiết hoặc gán quyền cho một tài khoản cụ thể bằng câu lệnh SQL trực tiếp:
1.  Mở pgAdmin (hoặc Client DB khác), kết nối tới DB theo thông số ở **Bước 2**.
2.  Mở công cụ **Query Tool** trên cơ sở dữ liệu `ticketbox_db`.
3.  Gõ câu lệnh SQL dưới đây và nhấn Execute (F5) để nâng cấp tài khoản:
    ```sql
    UPDATE users SET role = 'ADMIN' WHERE "userName" = 'tên_đăng_nhập_của_bạn';
    ```
    *(Thay thế `tên_đăng_nhập_của_bạn` bằng chính xác tên bạn đã nhập ở màn hình đăng nhập lúc đầu).*

---
