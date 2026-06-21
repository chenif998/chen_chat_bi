-- 创建销售数据表
CREATE TABLE IF NOT EXISTS sales_data (
  id BIGSERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  sales_amount DECIMAL(12, 2) NOT NULL,
  order_date DATE NOT NULL,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入模拟数据
INSERT INTO sales_data (product_name, category, sales_amount, order_date, region)
VALUES 
('MacBook Pro', 'Electronics', 19999.00, '2024-01-15', 'East China'),
('iPhone 15', 'Electronics', 6999.00, '2024-01-16', 'South China'),
('Herman Miller Chair', 'Furniture', 12000.00, '2024-01-17', 'North China'),
('Dell Monitor', 'Electronics', 3500.00, '2024-01-18', 'East China'),
('Coffee Machine', 'Appliances', 4500.00, '2024-01-19', 'West China'),
('Standing Desk', 'Furniture', 2800.00, '2024-01-20', 'South China'),
('iPad Air', 'Electronics', 4799.00, '2024-01-21', 'East China'),
('Mechanical Keyboard', 'Electronics', 899.00, '2024-01-22', 'North China'),
('Air Purifier', 'Appliances', 1500.00, '2024-01-23', 'South China'),
('Office Sofa', 'Furniture', 5500.00, '2024-01-24', 'East China');
-- ... 可以继续添加更多数据
