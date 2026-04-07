package com.example.mendvoxbackend.repository;

import com.example.mendvoxbackend.model.MendMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MendRepository extends JpaRepository<MendMessage, Long> {
    List<MendMessage> findAllByOrderByIdDesc();
}