---
title: Hệ thống đặt bàn nhà hàng
description: Web app đặt bàn realtime, có dashboard quản lý cho chủ quán.
tags: [react, node, postgres, websocket]
status: in-progress
link: https://demo-restaurant.example.com
repo: https://github.com/yourname/restaurant-booking
started: 2025-11-02
---

## Mục tiêu

Cho phép khách đặt bàn online, chủ quán quản lý bàn theo thời gian thực,
gửi xác nhận qua email/SMS.

## Checklist

- [x] Thiết kế schema database (bàn, khung giờ, đặt bàn)
- [x] API đặt bàn + kiểm tra trùng lịch
- [x] Realtime cập nhật trạng thái bàn qua WebSocket
- [x] Trang quản trị cho chủ quán
- [ ] Thanh toán đặt cọc online
- [ ] Viết test e2e cho luồng đặt bàn
- [ ] Deploy production + domain riêng

## Ghi chú

Đang vướng phần đồng bộ trạng thái bàn giữa nhiều thiết bị cùng lúc —
cần xem lại logic optimistic locking.

Phần thông báo (email/SMS) được tách qua action riêng — xem file trong
`actions/`, có [[restaurant-booking]] link ngược lại project này.
